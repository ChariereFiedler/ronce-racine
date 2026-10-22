import type { Fixture } from "../index.js";

export const designSystem: Fixture = {
  name: "design-system",
  why: "shared component with several call sites → frontend family evals",
  files: {
    "package.json": JSON.stringify({ devDependencies: { vue: "^3.4.0" } }, null, 2),
    "src/components/BaseButton.vue": "<script setup lang=\"ts\">\ndefineProps<{ label: string; kind: string }>()\n</script>\n<template>\n  <button :class=\"kind\">{{ label }}</button>\n</template>\n",
    "src/pages/Home.vue": "<template>\n  <BaseButton label=\"Go\" kind=\"primary\" />\n</template>\n",
    "src/pages/Settings.vue": "<template>\n  <base-button label=\"Save\" kind=\"ghost\" />\n</template>\n",
    "src/pages/Dyn.vue": "<template>\n  <component :is=\"'BaseButton'\" />\n</template>\n",
    // An aliased import: `grep BaseButton` never reaches this call site, so a
    // sweep that only greps the component name misses it. Without it the
    // fixture is small enough to read end to end, and the skill's exhaustive
    // sweep buys nothing - measured saturated on 2026-08-25.
    "src/pages/Billing.vue": "<script setup lang=\"ts\">\nimport { default as Btn } from '../components/BaseButton.vue'\n</script>\n<template>\n  <Btn label=\"Pay\" kind=\"primary\" />\n</template>\n",
    "src/pages/About.vue": "<template>\n  <p>Static page, no shared component here.</p>\n</template>\n",
    "src/utils/format.ts": "export const currency = (n: number): string => n.toFixed(2) + ' EUR'\n",
    "src/tokens.css": ":root {\n  --color-primary: #3b82f6;\n  --radius: 4px;\n}\n",
    "EXPECTED.md": "# Ground truth\n\n`BaseButton` call sites a full sweep must find:\n\n| File | Form |\n|---|---|\n| src/pages/Home.vue | PascalCase `<BaseButton>` |\n| src/pages/Settings.vue | kebab-case `<base-button>` |\n| src/pages/Dyn.vue | dynamic `<component :is=\"'BaseButton'\" />` |\n| src/pages/Billing.vue | aliased import, used as `<Btn>` |\n",
  },
};
