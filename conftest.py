"""Aísla las pruebas del almacenamiento persistente del desarrollador."""

import os
from tempfile import TemporaryDirectory

_PYTEST_TWIN_DATA = TemporaryDirectory(prefix="industrial-twin-pytest-")
os.environ["TWIN_DATA"] = _PYTEST_TWIN_DATA.name
