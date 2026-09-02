"""jupyterlite-webmcp: a JupyterLab frontend extension exposing the live
notebook workspace to a compatible browser agent through WebMCP.

This package ships a prebuilt frontend extension only. There is no server
extension: everything runs inside the browser, which is what makes the
extension work unchanged in JupyterLite.
"""

__version__ = "0.1.0"


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "jupyterlite-webmcp"}]
