"""Condiciones cortas sobre el estado de un equipo, p. ej. "level_pct > 1" o
"phase == 'discharge' and state != 'fault'".

Se evalúan con un subconjunto seguro de Python (comparaciones, and/or/not, listas y
constantes); no hay llamadas a funciones ni acceso a atributos, así que un texto escrito por
un usuario (o generado vía MCP) no puede ejecutar código.
"""

from __future__ import annotations

import ast
import operator
from collections.abc import Mapping
from typing import Any

_CMP = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


class ExprError(ValueError):
    pass


class Condition:
    """Condición compilada una vez y evaluada muchas veces."""

    def __init__(self, text: str) -> None:
        self.text = text
        try:
            self.tree = ast.parse(text, mode="eval").body
        except SyntaxError as exc:
            raise ExprError(f"condición inválida {text!r}: {exc.msg}") from exc
        self.names: set[str] = set()
        self._check(self.tree)

    def _check(self, node: ast.AST) -> None:
        if isinstance(node, ast.BoolOp):
            for v in node.values:
                self._check(v)
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            self._check(node.operand)
        elif isinstance(node, ast.Compare):
            if not all(type(op) in _CMP for op in node.ops):
                raise ExprError(f"operador no permitido en {self.text!r}")
            for v in [node.left, *node.comparators]:
                self._check(v)
        elif isinstance(node, ast.Name):
            self.names.add(node.id)
        elif isinstance(node, ast.Constant):
            pass
        elif isinstance(node, (ast.List, ast.Tuple)):
            for v in node.elts:
                self._check(v)
        else:
            raise ExprError(f"elemento no permitido ({type(node).__name__}) en {self.text!r}")

    def __call__(self, env: Mapping[str, Any]) -> bool:
        try:
            return bool(self._eval(self.tree, env))
        except TypeError:
            return False  # p. ej. None < 5: la variable aún no tiene valor

    def _eval(self, node: ast.AST, env: Mapping[str, Any]) -> Any:
        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                return all(self._eval(v, env) for v in node.values)
            return any(self._eval(v, env) for v in node.values)
        if isinstance(node, ast.UnaryOp):
            return not self._eval(node.operand, env)
        if isinstance(node, ast.Compare):
            left = self._eval(node.left, env)
            for op, comp in zip(node.ops, node.comparators, strict=True):
                right = self._eval(comp, env)
                if not _CMP[type(op)](left, right):
                    return False
                left = right
            return True
        if isinstance(node, ast.Name):
            if node.id not in env:
                raise ExprError(f"nombre desconocido {node.id!r} en {self.text!r}")
            return env[node.id]
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, (ast.List, ast.Tuple)):
            return [self._eval(v, env) for v in node.elts]
        raise ExprError(f"elemento no permitido en {self.text!r}")  # pragma: no cover
