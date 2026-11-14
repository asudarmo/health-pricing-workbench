import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { byExposure, FlagCard } from "@/components/flag-list";
import { Term } from "@/components/term";
import { GLOSSARY } from "@/lib/glossary";

const flag = (segment: string, exposure: number, gapType: "level shift" | "change in shape" = "level shift") => ({
  id: segment,
  segment,
  ae: 1.2,
  exposure,
  gapType,
  note: "n",
});

describe("Glossary", () => {
  it("shows the meaning and how to read a term when it is clicked", () => {
    render(<Term k="gini">Gini</Term>);
    fireEvent.click(screen.getByRole("button", { name: /What is Gini/ }));
    expect(screen.getByText(/ranks people/)).toBeTruthy();
    expect(screen.getByText(/Higher is better/)).toBeTruthy();
  });

  it("has a meaning for every term", () => {
    for (const entry of Object.values(GLOSSARY)) expect(entry.meaning.length).toBeGreaterThan(10);
  });

  it("ranks flags by exposure and writes the gap type in plain case", () => {
    expect(byExposure([flag("a", 1), flag("b", 9)]).map((f) => f.segment)).toEqual(["b", "a"]);
    render(<FlagCard flag={flag("Age 70-74", 5, "change in shape")} />);
    expect(screen.getByText("change in shape")).toBeTruthy();
  });
});
