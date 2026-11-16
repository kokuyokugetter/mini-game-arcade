#!/usr/bin/env python3
"""Preview the arcade at its GitHub Pages project path."""

import argparse
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
BASE_PATH = "/mini-game-arcade/"
HOST = "127.0.0.1"


class ArcadeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        request_path = urlsplit(self.path).path
        if request_path in ("/", BASE_PATH.rstrip("/")):
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", BASE_PATH)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        if not request_path.startswith(BASE_PATH):
            self.send_error(HTTPStatus.NOT_FOUND)
            return None

        try:
            target = Path(self.translate_path(self.path)).resolve()
            if target.is_dir():
                for index in ("index.html", "index.htm"):
                    candidate = target / index
                    if candidate.is_file():
                        target = candidate.resolve()
                        break
            relative = target.relative_to(ROOT)
        except (OSError, RuntimeError, ValueError):
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        if any(part.startswith(".") for part in relative.parts):
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        return super().send_head()

    def translate_path(self, path):
        return super().translate_path(path[len(BASE_PATH) - 1:])

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000, help="HTTP port (default: 8000)")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")

    handler = partial(ArcadeHandler, directory=ROOT)
    try:
        with ThreadingHTTPServer((HOST, args.port), handler) as server:
            print(f"http://{HOST}:{args.port}{BASE_PATH}  (Ctrl+C to stop)", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
