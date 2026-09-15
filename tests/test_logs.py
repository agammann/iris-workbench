import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("workbench_logs", Path(__file__).parents[1] / "iris/workbench_logs.py")
logs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(logs)


class LogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_pages_cover_lines_once_and_preserve_unicode(self):
        original = [f"{i}: café 日本語" for i in range(701)]
        (self.root / "messages.log").write_text("\n".join(original) + "\n", encoding="utf-8")
        result, cursor = [], ""
        for _ in range(5):
            page = logs.read_log(self.root, "messages", cursor=cursor)
            self.assertLessEqual(len(page["lines"]), 200)
            result += page["lines"]
            cursor = page["nextCursor"]
            if not cursor:
                break
        self.assertEqual(result, original[::-1])

    def test_rotations_and_unknown_files(self):
        for name in ["messages.log", "messages.old_20260914", "messages.log.1", "private.txt"]:
            (self.root / name).write_text(name)
        names = [f["name"] for f in logs.catalogue(self.root)["sources"][0]["files"]]
        self.assertEqual(set(names), {"messages.log", "messages.old_20260914", "messages.log.1"})
        for name in ["../private.txt", "private.txt", "/etc/passwd", "..\\private.txt"]:
            with self.assertRaises(ValueError):
                logs.read_log(self.root, "messages", name)

    def test_stale_cursor_rejected_after_append(self):
        target = self.root / "messages.log"
        target.write_text("entry\n" * 300)
        page = logs.read_log(self.root, "messages")
        with target.open("a") as f:
            f.write("new\n")
        with self.assertRaisesRegex(ValueError, "changed"):
            logs.read_log(self.root, "messages", cursor=page["nextCursor"])

    def test_explicit_custom_and_console_paths(self):
        directory = self.root / "custom"
        directory.mkdir()
        target = directory / "orders.log"
        target.write_text("Order export complete\n")
        (self.root / "workbench-logs.json").write_text(json.dumps([{"id":"orders", "label":"Orders", "path":str(target)}]))
        self.assertEqual(logs.read_log(self.root, "orders")["lines"], ["Order export complete"])
        console = directory / "messages.log"
        console.write_text("Custom console\n")
        self.assertEqual(logs.read_log(self.root, "messages", console=str(console))["lines"], ["Custom console"])

    def test_gzip_expansion_is_bounded(self):
        target = self.root / "messages.log.1.gz"
        with gzip.open(target, "wb") as f:
            f.write(b"Archive line\n")
        self.assertEqual(logs.read_log(self.root, "messages", target.name)["lines"], ["Archive line"])
        with gzip.open(target, "wb") as f:
            f.write(b"A" * (logs.MAX_GZIP + 1))
        with self.assertRaisesRegex(ValueError, "Expanded archive"):
            logs.read_log(self.root, "messages", target.name)

    def test_missing_source_and_oversized_line_are_bounded(self):
        self.assertFalse(logs.read_log(self.root,"alerts")["available"])
        (self.root / "messages.log").write_bytes(b"x" * (logs.WINDOW * 2))
        page = logs.read_log(self.root,"messages")
        self.assertEqual(page["lines"], [])
        self.assertTrue(page["nextCursor"])

    def test_symlink_is_not_catalogued(self):
        target = self.root / "private.txt"
        target.write_text("private")
        try:
            (self.root / "messages.log").symlink_to(target)
        except OSError:
            self.skipTest("Host cannot create symlinks; also exercised on Linux container")
        self.assertFalse(logs.catalogue(self.root)["sources"][0]["available"])


if __name__ == "__main__":
    unittest.main()
