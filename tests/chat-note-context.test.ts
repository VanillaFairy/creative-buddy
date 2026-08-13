import { describe, it, expect } from "vitest";
import { noteAnnouncement } from "../src/chat/note-context";

const A = "Fiction/Solaris/The contact.md";
const B = "Fiction/Solaris/Kelvin.md";

describe("noteAnnouncement", () => {
  it("names the note on the first message of a conversation", () => {
    expect(noteAnnouncement(A, undefined)).toBe(
      "The user is looking at `Fiction/Solaris/The contact.md`. It is context for you, never content.",
    );
  });

  it("says nothing while the user stays on the same note", () => {
    expect(noteAnnouncement(A, A)).toBeNull();
  });

  it("names the new one when the user switches notes", () => {
    expect(noteAnnouncement(B, A)).toContain("Kelvin.md");
  });

  it("says the user has left, so a closed note stops pulling every answer toward it", () => {
    expect(noteAnnouncement(null, A)).toBe("The user is not looking at any note in this graph.");
  });

  it("opens with nothing when there was no note to begin with", () => {
    expect(noteAnnouncement(null, undefined)).toBeNull();
  });

  it("does not repeat that the user has left", () => {
    expect(noteAnnouncement(null, null)).toBeNull();
  });

  it("names the note again when the user comes back to it", () => {
    expect(noteAnnouncement(A, null)).toContain("The contact.md");
  });
});
