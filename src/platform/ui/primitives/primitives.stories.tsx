import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bell, Download, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { Input, Kbd } from "./misc";
import { Segmented } from "./segmented";
import { Select } from "./select";
import { Switch } from "./switch";

const meta: Meta = { title: "Primitives/Overview" };
export default meta;

export const Buttons: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary">
        <Plus /> Primary
      </Button>
      <Button>Secondary</Button>
      <Button variant="outline">
        <Download /> Outline
      </Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="ghost" size="icon" aria-label="Notifications">
        <Bell />
      </Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};

export const Badges: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(["neutral", "accent", "up", "down", "good", "warning", "critical", "outline"] as const).map((t) => (
        <Badge key={t} tone={t}>
          {t}
        </Badge>
      ))}
    </div>
  ),
};

export const Controls: StoryObj = {
  render: function Render() {
    const [v, setV] = useState("1M");
    const [s, setS] = useState("NIFTY");
    const [on, setOn] = useState(true);
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={v} onChange={setV} options={["1D", "1W", "1M", "3M", "1Y"]} label="Range" />
        <Select value={s} onChange={setS} label="Underlying" options={[{ value: "NIFTY", label: "NIFTY" }, { value: "BANKNIFTY", label: "BANKNIFTY" }]} />
        <Switch checked={on} onCheckedChange={setOn} label="Auto-refresh" />
        <Input placeholder="Search…" aria-label="Search" className="w-48" />
        <span className="flex gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </div>
    );
  },
};
