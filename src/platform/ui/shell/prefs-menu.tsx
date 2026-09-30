"use client";
import { Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "../primitives/button";
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "../primitives/menu";
import { Tooltip } from "../primitives/tooltip";
import { getPreference, setPreference, type Density, type MarketScheme } from "../preferences";

export function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme !== "light";
  return (
    <Tooltip content={`Switch to ${dark ? "light" : "dark"} theme`}>
      <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={`Switch to ${dark ? "light" : "dark"} theme`}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}

/** Display preferences: density and market colour scheme (saved in this browser). */
export function PrefsMenu() {
  const [density, setDensity] = useState<Density>("comfortable");
  const [market, setMarket] = useState<MarketScheme>("teal-red");
  useEffect(() => {
    const sync = () => {
      setDensity(getPreference("density", "comfortable"));
      setMarket(getPreference("market", "teal-red"));
    };
    sync();
    window.addEventListener("tk-preferences", sync);
    return () => window.removeEventListener("tk-preferences", sync);
  }, []);
  return (
    <Menu>
      <Tooltip content="Display settings">
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Display settings">
            <SlidersHorizontal />
          </Button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent className="w-60">
        <MenuLabel>Density</MenuLabel>
        <MenuRadioGroup value={density} onValueChange={(v) => setPreference("density", v)}>
          <MenuRadioItem value="compact">Compact</MenuRadioItem>
          <MenuRadioItem value="comfortable">Comfortable</MenuRadioItem>
          <MenuRadioItem value="spacious">Spacious</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>Market colours</MenuLabel>
        <MenuRadioGroup value={market} onValueChange={(v) => setPreference("market", v)}>
          <MenuRadioItem value="teal-red">
            <span className="mr-2 inline-flex gap-0.5">
              <span className="size-2.5 rounded-sm bg-[#26a69a]" />
              <span className="size-2.5 rounded-sm bg-[#ef5350]" />
            </span>
            Teal / red
          </MenuRadioItem>
          <MenuRadioItem value="blue-orange">
            <span className="mr-2 inline-flex gap-0.5">
              <span className="size-2.5 rounded-sm bg-[#4a93e6]" />
              <span className="size-2.5 rounded-sm bg-[#d9761c]" />
            </span>
            Blue / orange (CVD)
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
