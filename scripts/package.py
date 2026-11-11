#!/usr/bin/env python3
"""Create and validate the Chrome Web Store ZIP using Python's standard library."""
import argparse
import hashlib
import json
import re
import struct
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNTIME_FILES = [
    "manifest.json", "background.js", "shared.js", "content.js",
    "popup.html", "popup.css", "popup.js", "options.html", "options.css", "options.js", "ai-helper.js",
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_file(name):
    path = ROOT / name
    require(path.resolve().is_relative_to(ROOT), "Path outside the project: " + name)
    require(path.is_file(), "Missing file: " + name)
    return path.read_bytes()


def png_size(name, expected, opaque=False):
    data = read_file(name)
    require(data[:8] == b"\x89PNG\r\n\x1a\n", "Not a PNG: " + name)
    require(struct.unpack(">II", data[16:24]) == expected, "Wrong image dimensions: " + name)
    if opaque:
        require(data[25] == 2, "Store images must be RGB PNGs without alpha: " + name)


class ResourceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.resources = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "img") and attrs.get("src"):
            self.resources.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.resources.append(attrs["href"])


def validate():
    manifest = json.loads(read_file("manifest.json"))
    version = manifest["version"]
    require(re.fullmatch(r"\d+(?:\.\d+){0,3}", version), "Invalid Chrome version")
    require(all(0 <= int(part) <= 65535 for part in version.split(".")), "Invalid version component")
    require(manifest.get("manifest_version") == 3, "Manifest V3 is required")
    require(int(manifest["minimum_chrome_version"].split(".")[0]) >= 138, "Chrome 138+ is required")
    require(set(manifest["permissions"]) == {"activeTab", "scripting", "storage", "userScripts"}, "Review the permission list and public justifications before changing it")
    require(set(manifest["optional_host_permissions"]) == {"http://*/*", "https://*/*"}, "Unexpected host permissions")
    require(not manifest.get("host_permissions"), "Site permissions must remain optional")
    require(manifest["content_security_policy"]["extension_pages"] == "script-src 'self'; object-src 'none'; base-uri 'none'", "Unexpected extension page CSP")
    require("update_url" not in manifest and "key" not in manifest, "Do not package a development key or update URL")

    files = set(RUNTIME_FILES)
    require(set(manifest["icons"]) == {"16", "32", "48", "128"}, "All four icon sizes are required")
    for size, name in manifest["icons"].items():
        png_size(name, (int(size), int(size)))
        files.add(name)
    for size, name in manifest["action"]["default_icon"].items():
        require(manifest["icons"].get(size) == name, "Action and extension icons must agree")

    locale_path = "_locales/" + manifest["default_locale"] + "/messages.json"
    messages = json.loads(read_file(locale_path))
    files.add(locale_path)
    for value in [manifest["name"], manifest["description"], manifest["action"]["default_title"]]:
        match = re.fullmatch(r"__MSG_(\w+)__", value)
        require(match is not None and match[1] in messages, "Unresolved manifest message: " + value)
    require(len(messages["extensionDescription"]["message"]) <= 132, "Manifest description exceeds 132 characters")

    for name in ["popup.html", "options.html"]:
        parser = ResourceParser()
        parser.feed(read_file(name).decode("utf-8"))
        for resource in parser.resources:
            require(resource in files, "Missing or external runtime resource: " + resource)
    for name in files:
        data = read_file(name)
        if name.endswith(".js"):
            require(not re.search(rb"\beval\s*\(|\bnew\s+Function\s*\(", data), "Do not execute user code in extension pages: " + name)

    for name in ["docs/index.html", "docs/privacy.html", "docs/permissions.html", "docs/store-listing.md", "docs/publishing.md", "docs/release-notes-v" + version + ".md"]:
        read_file(name)
    for name in ["01-css", "02-javascript", "03-site-controls"]:
        png_size("docs/assets/screenshots/" + name + ".png", (1280, 800), opaque=True)
    png_size("docs/assets/promotion_image/promotion_small.png", (440, 280), opaque=True)
    png_size("docs/assets/promotion_image/promotion_large.png", (1400, 560), opaque=True)
    return version, sorted(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist", help="Output directory (default: dist)")
    args = parser.parse_args()
    version, files = validate()
    args.output.mkdir(parents=True, exist_ok=True)
    destination = args.output / ("personal-page-tweaker-" + version + ".zip")
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in files:
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, read_file(name), compresslevel=9)
    with zipfile.ZipFile(destination) as archive:
        require(archive.testzip() is None, "ZIP integrity check failed")
        require(archive.namelist() == files, "Unexpected archive entries")
        for name in files:
            require(archive.read(name) == read_file(name), "Archive differs from source: " + name)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(".zip.sha256").write_text(digest + "  " + destination.name + "\n", encoding="utf-8")
    print(str(destination))
    print(str(len(files)) + " runtime files; " + str(destination.stat().st_size) + " bytes")
    print("SHA-256 " + digest)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        raise SystemExit("Packaging failed: " + str(error))
