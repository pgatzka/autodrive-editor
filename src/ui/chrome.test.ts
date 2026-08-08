import { describe, expect, it } from "vitest";
import { formatCount } from "./StatusBar";
import { shortenPath } from "./TitleBar";
import { stepGrid } from "./Toolbar";

describe("shortenPath", () => {
  it("keeps the savegame folder and the file name", () => {
    expect(shortenPath("/home/phil/FarmingSimulator2025/savegame3/AutoDrive_config.xml")).toBe(
      "…/savegame3/AutoDrive_config.xml"
    );
    expect(shortenPath("C:\\Users\\phil\\savegame1\\AutoDrive_config.xml")).toBe(
      "…/savegame1/AutoDrive_config.xml"
    );
  });

  it("leaves short paths alone", () => {
    expect(shortenPath("config.xml")).toBe("config.xml");
    expect(shortenPath("saves/config.xml")).toBe("saves/config.xml");
  });
});

describe("formatCount", () => {
  it("groups thousands so long counts stay scannable", () => {
    expect(formatCount(1284)).toBe("1 284");
    expect(formatCount(12)).toBe("12");
    expect(formatCount(1000000)).toBe("1 000 000");
  });
});

describe("stepGrid", () => {
  it("moves through the sizes players actually use", () => {
    expect(stepGrid(2, 1)).toBe(2.5);
    expect(stepGrid(2, -1)).toBe(1);
    expect(stepGrid(1, -1)).toBe(0.5);
  });

  it("stops at both ends", () => {
    expect(stepGrid(0.5, -1)).toBe(0.5);
    expect(stepGrid(50, 1)).toBe(50);
  });

  it("steps onto the ladder from a typed value between two rungs", () => {
    // 3 was typed by hand; stepping moves to the neighbouring rungs
    expect(stepGrid(3, 1)).toBe(4);
    expect(stepGrid(3, -1)).toBe(2.5);
    expect(stepGrid(999, -1)).toBe(50);
  });
});
