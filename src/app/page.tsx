import { redirect } from "next/navigation";

// Temporary: the product home page replaces this in the next step.
export default function Home() {
  redirect("/dashboards/recession");
}
