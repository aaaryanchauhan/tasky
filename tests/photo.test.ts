import { describe, expect, it } from "vitest";
import { detectImageType, initials, isOwnPhotoPath, photoObjectPath } from "@/lib/photo";

const bytes = (...n: number[]) => Uint8Array.from(n);

describe("detectImageType", () => {
  it("recognises JPEG, PNG and WebP by magic bytes", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ mime: "image/png", ext: "png" });
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(detectImageType(webp)).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("rejects everything else, however it is named", () => {
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<html><body>hi</body></html>"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull(); // truncated
    expect(detectImageType(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt "))).toBeNull(); // RIFF but not WebP
  });
});

describe("photo paths", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const nonce = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  it("builds and recognises only paths belonging to the member", () => {
    const p = photoObjectPath(id, "jpg", nonce);
    expect(p).toBe(`${id}/${nonce}.jpg`);
    expect(isOwnPhotoPath(id, p)).toBe(true);
    expect(isOwnPhotoPath("99999999-2222-3333-4444-555555555555", p)).toBe(false);
    expect(isOwnPhotoPath(id, `${id}/../other/${nonce}.jpg`)).toBe(false);
    expect(isOwnPhotoPath(id, `${id}/${nonce}.svg`)).toBe(false);
  });
});

describe("initials", () => {
  it("uses first and last name initials", () => {
    expect(initials("Rohit Sharma")).toBe("RS");
    expect(initials("  asha  ")).toBe("A");
    expect(initials("Mary Ann Smith")).toBe("MS");
    expect(initials("")).toBe("?");
  });
});
