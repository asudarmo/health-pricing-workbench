/** Plain-English meanings for the terms reviewers may not know. Shown by the Term component. */
export interface GlossaryEntry {
  name: string;
  meaning: string;
  read?: string; // how to interpret a value
}

export const GLOSSARY = {
  ae: {
    name: "A/E (actual over expected)",
    meaning: "Claims that actually happened, divided by the claims the model expected.",
    read: "1.00 means the model was spot on. Above 1.00 claims ran higher than expected, so prices may be too low. Below 1.00 means prices may be too high.",
  },
  headlineAE: {
    name: "Headline A/E",
    meaning: "The A/E for the whole book in the latest year the model has not seen (2023).",
    read: "Close to 1.00 is good. The further from 1.00, the stronger the case to revisit prices.",
  },
  baseRate: {
    name: "Base rate",
    meaning: "The starting premium for a reference profile. Each rating factor then multiplies it up or down.",
    read: "It is not the average price. Most people pay more or less than this, depending on their factors.",
  },
  bookAverage: {
    name: "Book average",
    meaning: "The average premium across all the covered lives in the data.",
  },
  abi: {
    name: "ABI",
    meaning: "The Association of British Insurers. Its 2023 average claim costs are used to turn the model's US dollar scale into illustrative pounds.",
  },
  gini: {
    name: "Gini",
    meaning: "How well the model ranks people from lower to higher cost. It runs from 0 (no better than guessing) to 1 (perfect).",
    read: "Higher is better. Health cost is hard to predict, so values around 0.3 to 0.5 are typical.",
  },
  deviance: {
    name: "Deviance",
    meaning: "A single score for how far the model's predictions sit from what really happened.",
    read: "Lower is better. It is mainly useful for comparing two models on the same data.",
  },
  trend: {
    name: "Trend",
    meaning: "The yearly rise in claims cost assumed when moving from the data year to the pricing year.",
    read: "1.019 means costs grow by 1.9% a year.",
  },
  rebase: {
    name: "Rebase",
    meaning: "A one-off adjustment to the whole price level, so the prices match the latest claims experience.",
    read: "1.06 means prices are lifted by 6%.",
  },
  exposure: {
    name: "Exposure",
    meaning: "How much insured time sits behind a figure, counted in lives (one life covered for one year).",
    read: "More exposure means a more reliable figure.",
  },
  relativity: {
    name: "Relativity",
    meaning: "How much a group pays compared with the reference group, all else equal.",
    read: "1.00 is the same as the reference. 1.20 means 20% more. 0.80 means 20% less.",
  },
  levelShift: {
    name: "Level shift",
    meaning: "Claims in this group are consistently above or below expected, even after allowing for the book as a whole.",
    read: "A hint that the whole group needs its price moved up or down.",
  },
  changeInShape: {
    name: "Change in shape",
    meaning: "This group differs from the rest of the book, so the pattern across groups has changed, not just the overall level.",
    read: "A hint that the factor's relativities need a closer look.",
  },
  psi: {
    name: "Population stability index (PSI)",
    meaning: "How much the mix of customers has changed compared with the data the model was built on.",
    read: "Under 0.10 is stable. 0.10 to 0.25 is a moderate shift. Above 0.25 is a significant shift.",
  },
  baseRateChange: {
    name: "Base rate change",
    meaning: "A percentage change applied to every customer's premium, whatever their profile.",
    read: "+2% raises all premiums by 2%. Negative values lower them.",
  },
  averagePremiumChange: {
    name: "Average premium change",
    meaning: "How much the premium for the whole book moves on average if this scenario goes ahead, weighted by exposure.",
    read: "Red means customers pay more on average. Green means they pay less.",
  },
  dislocation: {
    name: "Dislocation",
    meaning: "How many customers see their own premium move, and by how much. It shows who is affected, not just the average.",
    read: "A tall bar near 0% means few people notice the change. Bars far to the left or right mean some customers face large changes.",
  },
  affectedSegments: {
    name: "Affected segments",
    meaning: "Groups of customers whose average premium changes by at least 0.005%, with the average change for each group.",
    read: "Red is an increase and green is a decrease.",
  },
  cappedLives: {
    name: "Capped lives",
    meaning: "Customers whose increase would have been larger, but is held at the cap. Counted in lives (rounded).",
    read: "A high number means the cap is doing a lot of the work, so the full price rise is not being delivered.",
  },
  flooredLives: {
    name: "Floored lives",
    meaning: "Customers whose decrease would have been larger, but is held at the floor. Counted in lives (rounded).",
  },
  cap: {
    name: "Cap",
    meaning: "The largest price increase any single customer group can get in this scenario.",
  },
  floor: {
    name: "Floor",
    meaning: "The largest price decrease any single customer group can get in this scenario.",
  },
  recalibration: {
    name: "Recalibration flag",
    meaning: "A warning from the pricing service that a group's actual claims differ clearly from what the model expected.",
    read: "Flags are prompts for a pricing review, not errors in the app.",
  },
  projectedAE: {
    name: "Projected A/E",
    meaning: "What the A/E would be if the scenario's price changes were applied to the same claims.",
    read: "Closer to 1.00 means the new prices fit the claims better.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
