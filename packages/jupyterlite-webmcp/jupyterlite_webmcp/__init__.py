"""jupyterlite-webmcp: a JupyterLab frontend extension exposing the live
notebook workspace to a compatible browser agent through WebMCP.

This package ships a prebuilt frontend extension only. There is no server
extension: everything runs inside the browser, which is what makes the
extension work unchanged in JupyterLite.
"""

try:
    # Written at build time from package.json by hatch's version hook.
    from ._version import __version__
except ImportError:  # a source checkout that has never been built
    __version__ = "0.0.0+unknown"


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "jupyterlite-webmcp"}]
