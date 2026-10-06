import { linkify } from "../linkify";

const urls = (s) => linkify(s).filter((p) => p.url).map((p) => p.url);
const rejoin = (s) => linkify(s).map((p) => p.text).join("");

describe("linkify", () => {
  test("plain text has no links", () => {
    expect(linkify("Buy milk")).toEqual([{ text: "Buy milk", url: null }]);
    expect(urls("save it as notes.txt")).toEqual([]);
  });

  test("finds http, https and www links", () => {
    expect(urls("see http://a.com and https://b.org/x?y=1")).toEqual(["http://a.com", "https://b.org/x?y=1"]);
    expect(urls("go to www.example.com now")).toEqual(["https://www.example.com"]);
  });

  test("www links keep their shown text but open with https", () => {
    const p = linkify("www.example.com").find((x) => x.url);
    expect(p).toEqual({ text: "www.example.com", url: "https://www.example.com" });
  });

  test("drops trailing sentence punctuation", () => {
    expect(urls("Read https://a.com/page.")).toEqual(["https://a.com/page"]);
    expect(urls("Is it https://a.com/page?")).toEqual(["https://a.com/page"]);
    expect(urls("links: https://a.com, https://b.com;")).toEqual(["https://a.com", "https://b.com"]);
  });

  test("drops an unbalanced closing bracket but keeps a balanced one", () => {
    expect(urls("(see https://a.com/x)")).toEqual(["https://a.com/x"]);
    expect(urls("https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
  });

  test("a lone scheme is not a link", () => {
    expect(urls("type https:// first")).toEqual([]);
    expect(urls("www. nothing")).toEqual([]);
  });

  test("keeps newlines and rejoins to the exact input", () => {
    const s = "Deadline notes:\nhttps://a.com/doc\nthen email (www.b.org).";
    expect(rejoin(s)).toBe(s);
    expect(urls(s)).toEqual(["https://a.com/doc", "https://www.b.org"]);
  });

  test("handles empty and null input", () => {
    expect(linkify("")).toEqual([]);
    expect(linkify(null)).toEqual([]);
  });
});
