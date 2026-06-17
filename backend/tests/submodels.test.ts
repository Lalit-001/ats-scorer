import { describe, it, expect } from "vitest";
import { structureResume, classifyImages, structureLinks } from "../src/pipeline/submodels.js";
import { evaluate } from "../src/pipeline/evaluator.js";
import type { GeminiRequest } from "../src/llm/geminiClient.js";

describe("structureResume", () => {
  it("sends the resume text to the model and returns its JSON", async () => {
    let seen: GeminiRequest | undefined;
    const call = async (req: GeminiRequest) => {
      seen = req;
      return { contact: { name: "Jane" }, skills: ["React"] };
    };
    const result = await structureResume({ text: "Jane Developer, React", links: [] }, call);
    expect(seen?.prompt).toContain("Jane Developer");
    expect(result).toEqual({ contact: { name: "Jane" }, skills: ["React"] });
  });
});

describe("classifyImages", () => {
  it("classifies each image and attaches its bytes to the request", async () => {
    const calls: GeminiRequest[] = [];
    const call = async (req: GeminiRequest) => {
      calls.push(req);
      return { imageType: "certificate", details: { issuer: "AWS" } };
    };
    const loadImage = async () => ({ mimeType: "image/png", data: Buffer.from("x") });

    const result = await classifyImages([{ index: 0, path: "/a.png" }], call, loadImage);

    expect(result).toEqual([{ index: 0, imageType: "certificate", details: { issuer: "AWS" } }]);
    expect(calls[0].images?.[0].mimeType).toBe("image/png");
  });

  it("returns an empty array when there are no images", async () => {
    const result = await classifyImages([], async () => ({}), async () => ({
      mimeType: "image/png",
      data: Buffer.from(""),
    }));
    expect(result).toEqual([]);
  });
});

describe("structureLinks", () => {
  it("categorizes icon links via the model", async () => {
    const call = async () => ({ links: [{ category: "linkedin", url: "https://linkedin.com/in/j" }] });
    const result = await structureLinks({ icon_links: [{ uri: "https://linkedin.com/in/j" }] }, call);
    expect(result).toEqual({ links: [{ category: "linkedin", url: "https://linkedin.com/in/j" }] });
  });
});

describe("evaluate", () => {
  it("returns a validated evaluation result", async () => {
    const call = async () => ({
      matchScore: 82,
      recommendation: "good_match",
      strengths: ["React"],
      gaps: ["No k8s"],
    });
    const result = await evaluate("JD: React dev", { skills: ["React"] }, call);
    expect(result.matchScore).toBe(82);
    expect(result.recommendation).toBe("good_match");
  });

  it("rejects an out-of-range or malformed score", async () => {
    const call = async () => ({
      matchScore: 250,
      recommendation: "good_match",
      strengths: [],
      gaps: [],
    });
    await expect(evaluate("JD", {}, call)).rejects.toThrow();
  });
});
