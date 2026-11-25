import { describe, it, expect } from "vitest";
import { parseBulk } from "./admin";

describe("bulk paste parser", () => {
  it("reads Excel rows in either column order, skips header, flags bad rows", () => {
    const { rows, invalid } = parseBulk("Name\tEmail\nJordan Lee\tJordan@Optimussbr.com \nsam@optimussbr.com, Sam P\nBad\tnot-an-email\nstray text\n\n");
    expect(rows).toEqual([
      { line: 2, email: "jordan@optimussbr.com", name: "Jordan Lee" },
      { line: 3, email: "sam@optimussbr.com", name: "Sam P" },
    ]);
    expect(invalid.map((i) => i.line)).toEqual([4, 5]);
  });
  it("accepts a bare email list and Outlook-style addresses", () => {
    const { rows } = parseBulk("a@optimussbr.com\nB Name <b@optimussbr.com>");
    expect(rows.map((r) => r.email)).toEqual(["a@optimussbr.com", "b@optimussbr.com"]);
  });
});
