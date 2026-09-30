import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";
import "./fonts.css";
import { TooltipProvider } from "../src/platform/ui/primitives/tooltip";

/** Every story renders inside the `.tk` token scope; theme and density are toolbar globals. */
const preview: Preview = {
  globalTypes: {
    theme: { description: "Theme", toolbar: { title: "Theme", icon: "mirror", items: ["dark", "light"], dynamicTitle: true } },
    density: { description: "Density", toolbar: { title: "Density", icon: "component", items: ["compact", "comfortable", "spacious"], dynamicTitle: true } },
    market: { description: "Market colours", toolbar: { title: "Market", icon: "paintbrush", items: ["teal-red", "blue-orange"], dynamicTitle: true } },
  },
  initialGlobals: { theme: "dark", density: "comfortable", market: "teal-red" },
  parameters: { layout: "padded", a11y: { test: "error" }, backgrounds: { disable: true } },
  decorators: [
    (Story, ctx) => {
      const root = document.documentElement;
      root.dataset.theme = ctx.globals.theme;
      root.dataset.density = ctx.globals.density;
      root.dataset.market = ctx.globals.market;
      return (
        <TooltipProvider>
          <div className="tk min-h-screen p-6">
            <Story />
          </div>
        </TooltipProvider>
      );
    },
  ],
};
export default preview;
