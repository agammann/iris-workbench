# Selected design

The user selected the charcoal and amber Logs concept, supplied again as a screenshot. Visual reference: ../gui-research/concepts/option-2.png. Preserve the horizontal navigation, two chrome rows, event table and right inspector. All six management areas use this same structure.

## Tokens and components

Background #101416; surface #151a1d; borders #293137; primary text #e4e8ed; secondary #a4aeba; amber #f5b253. Inter is the interface typeface; IBM Plex Mono is used for identifiers. Base controls 15px, table 14px, heading 36px, inspector title 27px. Border radius 4px. Table rows 44px. Main split 68% / 32%, main padding 32px. Header 68px, connection bar 54px. Tabler outline icons use 20px and stroke 1.7.

No raster assets are needed: this target contains editable application text, standard interface icons and semantic status indicators. No decorative illustrations, photographs or custom logo asset occurs in the reference. Use the supplied concept only as a visual reference, never as the application UI.

## Functional adaptations

The user accepted making Refresh quieter, tightening spacing where useful and distinguishing disabled status from warnings. A live backend requires real timestamps and source names instead of the six fictional events. The default is live data. A clearly labelled design sample mode is included only to compare the reference state; sample writes never reach IRIS. Runtime and audit sources have different fields; the inspector preserves original source details. Responsive screens collapse the inspector below the list and allow deliberate horizontal table scrolling.

Connection setup, resource tabs, field editors, change review and results are required extensions in the same design system. The product uses accurate entity names and explicitly names incomplete verification. No automatic repair, rollback, or complete log coverage claims.
