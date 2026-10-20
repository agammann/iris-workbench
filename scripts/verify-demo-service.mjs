const expectedBody = '{"service":"Workbench demonstration","status":"ready"}';

export function verifiedDemoService(body) {
  if (body !== expectedBody) throw Error("Independent service response differs from the pinned demonstration");
  return { service: "Workbench demonstration", status: "ready" };
}
