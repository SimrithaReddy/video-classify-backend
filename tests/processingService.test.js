"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const processingService_1 = require("../src/services/processingService");
describe("classifySensitivity", () => {
    it("flags known sensitive keywords in the fallback heuristic", () => {
        const result = (0, processingService_1.classifySensitivityFallback)({
            title: "violence scene",
            fileSize: 120,
            originalName: "clip.mp4",
        });
        expect(result).toBe("flagged");
    });
    it("marks neutral content as safe in the fallback heuristic", () => {
        const result = (0, processingService_1.classifySensitivityFallback)({
            title: "family vacation",
            fileSize: 121,
            originalName: "holiday.mp4",
        });
        expect(result).toBe("safe");
    });
    it("uses the fallback path when no media url is available", async () => {
        const result = await (0, processingService_1.classifySensitivity)({
            title: "team outing",
            fileSize: 125,
            originalName: "trip.mp4",
            cloudinarySecureUrl: undefined,
            storagePath: "",
        });
        expect(result).toBe("safe");
    });
});
