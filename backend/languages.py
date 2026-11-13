"""Multilingual parsing foundation built on tree-sitter.

The module exposes a single, deterministic analysis surface for every language
Merilo supports.  Grammar packages are imported lazily inside the parser
factories, so importing this module never touches a grammar that is not used by
the current request.  Nothing here executes the submitted code: tree-sitter only
builds a syntax tree, which is then traversed once per parse.

Known upstream limitations
--------------------------
``tree-sitter-kotlin==1.1.0`` (the pinned grammar) cannot parse a valid Kotlin
class whose body starts on the same line as the opening brace, for example
``class A { fun f() {} }``.  The grammar reports a syntax error even though the
snippet is valid Kotlin; a newline after the opening brace parses correctly.
This is an upstream grammar limitation rather than a Merilo parsing rule, and it
is documented by ``test_kotlin_same_line_class_body_is_upstream_limitation``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from tree_sitter import Language, Parser

NAME_LIMIT = 80


class UnsupportedLanguage(ValueError):
    """Raised when a language key is not present in ``SUPPORTED_LANGUAGES``."""


@dataclass(frozen=True)
class FunctionInfo:
    """A named function or method found in the syntax tree."""

    name: str
    params: str
    line: int


@dataclass(frozen=True)
class BranchInfo:
    """A branch or loop node; ``kind`` is the tree-sitter node type."""

    kind: str
    line: int


@dataclass(frozen=True)
class CodeAnalysis:
    """Deterministic, execution-free summary of a submitted snippet."""

    language: str
    parse_ok: bool
    error: str | None
    error_line: int | None
    functions: list[FunctionInfo]
    branches: list[BranchInfo]
    loops: list[BranchInfo]
    returns: list[int]
    classes: list[str]
    line_count: int


@dataclass(frozen=True)
class LanguageProfile:
    """Everything the analysis layer needs to know about one language."""

    key: str
    label: str
    extensions: tuple[str, ...]
    parser_factory: Callable[[], Any]
    function_nodes: frozenset[str]
    branch_nodes: frozenset[str]
    loop_nodes: frozenset[str]
    rubric_hint: str


# =============================================================================
# Lazy grammar factories (module import stays cheap and offline-safe)
# =============================================================================

def _python_language() -> Any:
    import tree_sitter_python

    return tree_sitter_python.language()


def _javascript_language() -> Any:
    import tree_sitter_javascript

    return tree_sitter_javascript.language()


def _typescript_language() -> Any:
    import tree_sitter_typescript

    return tree_sitter_typescript.language_typescript()


def _java_language() -> Any:
    import tree_sitter_java

    return tree_sitter_java.language()


def _go_language() -> Any:
    import tree_sitter_go

    return tree_sitter_go.language()


def _csharp_language() -> Any:
    import tree_sitter_c_sharp

    return tree_sitter_c_sharp.language()


def _cpp_language() -> Any:
    import tree_sitter_cpp

    return tree_sitter_cpp.language()


def _c_language() -> Any:
    import tree_sitter_c

    return tree_sitter_c.language()


def _rust_language() -> Any:
    import tree_sitter_rust

    return tree_sitter_rust.language()


def _ruby_language() -> Any:
    import tree_sitter_ruby

    return tree_sitter_ruby.language()


def _php_language() -> Any:
    import tree_sitter_php

    return tree_sitter_php.language_php()


def _kotlin_language() -> Any:
    import tree_sitter_kotlin

    return tree_sitter_kotlin.language()


def _swift_language() -> Any:
    import tree_sitter_swift

    return tree_sitter_swift.language()


# =============================================================================
# Language profiles — exactly 13 keys, treated as stable identifiers
# =============================================================================

SUPPORTED_LANGUAGES: dict[str, LanguageProfile] = {
    "python": LanguageProfile(
        key="python",
        label="Python",
        extensions=(".py", ".pyw"),
        parser_factory=_python_language,
        function_nodes=frozenset({"function_definition"}),
        branch_nodes=frozenset(
            {
                "if_statement",
                "elif_clause",
                "else_clause",
                "conditional_expression",
                "match_statement",
                "case_clause",
                "try_statement",
                "except_clause",
                "finally_clause",
            }
        ),
        loop_nodes=frozenset({"for_statement", "while_statement"}),
        rubric_hint="пустые коллекции, None, отрицательные числа и изменяемые аргументы по умолчанию",
    ),
    "javascript": LanguageProfile(
        key="javascript",
        label="JavaScript",
        extensions=(".js", ".mjs", ".cjs", ".jsx"),
        parser_factory=_javascript_language,
        function_nodes=frozenset(
            {
                "function_declaration",
                "function_expression",
                "arrow_function",
                "method_definition",
                "generator_function",
                "generator_function_declaration",
            }
        ),
        branch_nodes=frozenset(
            {
                "if_statement",
                "else_clause",
                "switch_statement",
                "switch_case",
                "switch_default",
                "ternary_expression",
                "try_statement",
                "catch_clause",
                "finally_clause",
            }
        ),
        loop_nodes=frozenset({"for_statement", "for_in_statement", "while_statement", "do_statement"}),
        rubric_hint="undefined, null, NaN, пустые массивы и отклонённые асинхронные операции",
    ),
    "typescript": LanguageProfile(
        key="typescript",
        label="TypeScript",
        extensions=(".ts", ".tsx", ".mts", ".cts"),
        parser_factory=_typescript_language,
        function_nodes=frozenset(
            {
                "function_declaration",
                "function_expression",
                "arrow_function",
                "method_definition",
                "generator_function",
                "generator_function_declaration",
            }
        ),
        branch_nodes=frozenset(
            {
                "if_statement",
                "else_clause",
                "switch_statement",
                "switch_case",
                "switch_default",
                "ternary_expression",
                "try_statement",
                "catch_clause",
                "finally_clause",
            }
        ),
        loop_nodes=frozenset({"for_statement", "for_in_statement", "while_statement", "do_statement"}),
        rubric_hint="null, undefined, сужение типов и пустые массивы",
    ),
    "java": LanguageProfile(
        key="java",
        label="Java",
        extensions=(".java",),
        parser_factory=_java_language,
        function_nodes=frozenset(
            {"method_declaration", "constructor_declaration", "compact_constructor_declaration"}
        ),
        branch_nodes=frozenset(
            {
                "if_statement",
                "switch_expression",
                "switch_label",
                "ternary_expression",
                "catch_clause",
                "finally_clause",
            }
        ),
        loop_nodes=frozenset(
            {"for_statement", "enhanced_for_statement", "while_statement", "do_statement"}
        ),
        rubric_hint="null, переполнение int, пустые коллекции и границы массивов",
    ),
    "go": LanguageProfile(
        key="go",
        label="Go",
        extensions=(".go",),
        parser_factory=_go_language,
        function_nodes=frozenset({"function_declaration", "method_declaration", "func_literal"}),
        branch_nodes=frozenset(
            {
                "if_statement",
                "expression_switch_statement",
                "type_switch_statement",
                "expression_case",
                "type_case",
                "default_case",
                "select_statement",
                "communication_case",
            }
        ),
        loop_nodes=frozenset({"for_statement"}),
        rubric_hint="nil-указатели, нулевые значения, пустые срезы и переполнение",
    ),
    "csharp": LanguageProfile(
        key="csharp",
        label="C#",
        extensions=(".cs",),
        parser_factory=_csharp_language,
        function_nodes=frozenset(
            {"method_declaration", "constructor_declaration", "local_function_statement"}
        ),
        branch_nodes=frozenset(
            {
                "if_statement",
                "switch_statement",
                "switch_expression",
                "switch_section",
                "switch_expression_arm",
                "conditional_expression",
                "catch_clause",
                "finally_clause",
            }
        ),
        loop_nodes=frozenset(
            {"for_statement", "foreach_statement", "while_statement", "do_statement"}
        ),
        rubric_hint="null, переполнение, пустые коллекции и освобождённые объекты",
    ),
    "cpp": LanguageProfile(
        key="cpp",
        label="C++",
        extensions=(".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx"),
        parser_factory=_cpp_language,
        function_nodes=frozenset({"function_definition"}),
        branch_nodes=frozenset(
            {
                "if_statement",
                "switch_statement",
                "case_statement",
                "conditional_expression",
                "try_statement",
                "catch_clause",
            }
        ),
        loop_nodes=frozenset(
            {"for_statement", "for_range_loop", "while_statement", "do_statement"}
        ),
        rubric_hint="пустые контейнеры, переполнение, висячие ссылки и nullptr",
    ),
    "c": LanguageProfile(
        key="c",
        label="C",
        extensions=(".c", ".h"),
        parser_factory=_c_language,
        function_nodes=frozenset({"function_definition"}),
        branch_nodes=frozenset(
            {"if_statement", "switch_statement", "case_statement", "conditional_expression"}
        ),
        loop_nodes=frozenset({"for_statement", "while_statement", "do_statement"}),
        rubric_hint="нулевые указатели, переполнение, пустые массивы и границы буфера",
    ),
    "rust": LanguageProfile(
        key="rust",
        label="Rust",
        extensions=(".rs",),
        parser_factory=_rust_language,
        function_nodes=frozenset({"function_item"}),
        branch_nodes=frozenset(
            {"if_expression", "match_expression", "match_arm", "try_expression"}
        ),
        loop_nodes=frozenset({"for_expression", "while_expression", "loop_expression"}),
        rubric_hint="пустые коллекции, переполнение, Option/Result и заимствование",
    ),
    "ruby": LanguageProfile(
        key="ruby",
        label="Ruby",
        extensions=(".rb",),
        parser_factory=_ruby_language,
        function_nodes=frozenset({"method", "singleton_method"}),
        branch_nodes=frozenset(
            {
                "if",
                "unless",
                "elsif",
                "else",
                "case",
                "when",
                "conditional",
                "rescue",
                "if_modifier",
                "unless_modifier",
            }
        ),
        loop_nodes=frozenset({"while", "until", "for", "while_modifier", "until_modifier"}),
        rubric_hint="nil, пустые коллекции, отрицательные индексы и строки в UTF-8",
    ),
    "php": LanguageProfile(
        key="php",
        label="PHP",
        extensions=(".php",),
        parser_factory=_php_language,
        function_nodes=frozenset(
            {"function_definition", "method_declaration", "anonymous_function", "arrow_function"}
        ),
        branch_nodes=frozenset(
            {
                "if_statement",
                "else_clause",
                "else_if_clause",
                "switch_statement",
                "case_statement",
                "conditional_expression",
                "match_expression",
                "match_conditional_expression",
                "try_statement",
                "catch_clause",
                "finally_clause",
            }
        ),
        loop_nodes=frozenset(
            {"for_statement", "foreach_statement", "while_statement", "do_statement"}
        ),
        rubric_hint="null, пустые массивы, нестрогие сравнения и приведение типов",
    ),
    "kotlin": LanguageProfile(
        key="kotlin",
        label="Kotlin",
        extensions=(".kt", ".kts"),
        parser_factory=_kotlin_language,
        function_nodes=frozenset({"function_declaration"}),
        branch_nodes=frozenset(
            {"if_expression", "when_expression", "when_entry", "try_expression", "catch_block"}
        ),
        loop_nodes=frozenset({"for_statement", "while_statement", "do_while_statement"}),
        rubric_hint="null, пустые коллекции, переполнение Int и границы диапазонов",
    ),
    "swift": LanguageProfile(
        key="swift",
        label="Swift",
        extensions=(".swift",),
        parser_factory=_swift_language,
        function_nodes=frozenset({"function_declaration", "init_declaration"}),
        branch_nodes=frozenset(
            {
                "if_statement",
                "guard_statement",
                "switch_statement",
                "switch_entry",
                "ternary_expression",
                "catch_block",
            }
        ),
        loop_nodes=frozenset({"for_statement", "while_statement", "repeat_while_statement"}),
        rubric_hint="nil, пустые коллекции, переполнение Int и выход за границы массива",
    ),
}


# =============================================================================
# Node-type helpers
# =============================================================================

_IDENTIFIER_NODE_TYPES = frozenset(
    {
        "identifier",
        "type_identifier",
        "name",
        "simple_identifier",
        "field_identifier",
        "property_identifier",
        "constant",
        "namespace_identifier",
    }
)

_PARAMETER_NODE_TYPES = frozenset(
    {
        "parameters",
        "formal_parameters",
        "parameter_list",
        "method_parameters",
        "function_value_parameters",
    }
)

# C and C++ expose the declared name through a declarator instead of a ``name`` field.
_NAME_FALLBACK_NODES = frozenset(
    {"class_specifier", "struct_specifier", "union_specifier", "type_declaration"}
)

# Wrapper declarators whose own ``declarator`` field holds the real name.
_DECLARATOR_WRAPPER_NODES = frozenset(
    {
        "pointer_declarator",
        "function_declarator",
        "reference_declarator",
        "array_declarator",
        "parenthesized_declarator",
        "attributed_declarator",
        "init_declarator",
        "abstract_function_declarator",
    }
)

# ``parenthesized_declarator`` keeps its inner declarator as an unfielded named
# child, so the field-based descent needs this fallback to keep walking.
_DECLARATOR_CHILD_KINDS = frozenset(
    {
        "pointer_declarator",
        "function_declarator",
        "reference_declarator",
        "array_declarator",
        "parenthesized_declarator",
        "identifier",
        "field_identifier",
        "qualified_identifier",
        "operator_name",
        "destructor_name",
    }
)

# Anonymous function nodes can take their name from an enclosing declaration.
_ASSIGNED_NAME_PARENTS = {
    "variable_declarator": "name",
    "public_field_definition": "name",
    "field_definition": "name",
    "property_declaration": "name",
    "assignment_expression": "left",
    "assignment": "left",
}

_ANONYMOUS_FUNCTION_NODE_TYPES = frozenset(
    {
        "function_expression",
        "arrow_function",
        "anonymous_function",
        "generator_function",
        "closure_expression",
        "lambda_expression",
    }
)

_CLASS_NODE_TYPES = frozenset(
    {
        "class_definition",
        "class_declaration",
        "class_specifier",
        "struct_specifier",
        "union_specifier",
        "struct_declaration",
        "struct_item",
        "union_item",
        "enum_item",
        "trait_item",
        "trait_declaration",
        "interface_declaration",
        "record_declaration",
        "enum_declaration",
        "protocol_declaration",
        "object_declaration",
        "type_declaration",
        "class",
        "module",
    }
)

_RETURN_NODE_TYPES = frozenset({"return_statement", "return_expression", "return"})

# Readable Russian labels for the tree-sitter node kinds used by the questions.
_KIND_LABELS: dict[str, str] = {
    "if_statement": "условие if",
    "if_expression": "условие if",
    "if": "условие if",
    "unless": "условие unless",
    "elif_clause": "ветка elif",
    "elsif": "ветка elsif",
    "else_clause": "ветка else",
    "else": "ветка else",
    "switch_statement": "конструкция switch",
    "switch_expression": "выражение switch",
    "switch_case": "ветка case",
    "switch_section": "ветка case",
    "switch_label": "ветка case",
    "switch_entry": "ветка case",
    "case_statement": "ветка case",
    "case": "ветка case",
    "when": "ветка when",
    "when_entry": "ветка when",
    "when_expression": "выражение when",
    "match_statement": "сопоставление match",
    "match_expression": "сопоставление match",
    "match_arm": "ветка match",
    "conditional_expression": "тернарное условие",
    "ternary_expression": "тернарное условие",
    "catch_clause": "обработка исключения",
    "except_clause": "обработка исключения",
    "rescue": "обработка исключения",
    "catch_block": "обработка исключения",
    "guard_statement": "guard-проверка",
    "try_statement": "блок try",
    "try_expression": "выражение try",
    "for_statement": "цикл for",
    "for_expression": "цикл for",
    "for_in_statement": "цикл for",
    "for_range_loop": "цикл for",
    "enhanced_for_statement": "цикл for-each",
    "foreach_statement": "цикл foreach",
    "while_statement": "цикл while",
    "while_expression": "цикл while",
    "while": "цикл while",
    "do_statement": "цикл do-while",
    "do_while_statement": "цикл do-while",
    "repeat_while_statement": "цикл repeat-while",
    "loop_expression": "цикл loop",
    "until": "цикл until",
    "for": "цикл for",
    "while_modifier": "цикл while",
    "until_modifier": "цикл until",
}


# =============================================================================
# Extraction helpers
# =============================================================================

def _truncate(value: str, limit: int = NAME_LIMIT) -> str:
    return value if len(value) <= limit else value[: limit - 1] + "…"


def _node_text(node: Any) -> str:
    return node.text.decode("utf-8", errors="replace")


def _first_identifier(node: Any) -> Any | None:
    stack = list(reversed(node.children))
    while stack:
        current = stack.pop()
        if current.type in _IDENTIFIER_NODE_TYPES:
            return current
        stack.extend(reversed(current.children))
    return None


def _declarator_child(node: Any) -> Any | None:
    """Return the declarator nested in ``node``.

    ``parenthesized_declarator`` (tree-sitter-c 0.23.4) stores its inner
    ``pointer_declarator``/``function_declarator`` as an unfielded named child,
    which breaks a purely field-based descent.  When the ``declarator`` field is
    absent, fall back to the first named child whose kind is declarator-like.
    """
    direct = node.child_by_field_name("declarator")
    if direct is not None:
        return direct
    for child in node.children:
        if child.is_named and child.type in _DECLARATOR_CHILD_KINDS:
            return child
    return None


def _declarator_name(node: Any) -> str:
    """Resolve the declared name from a C/C++ ``declarator`` field chain."""
    declarator = _declarator_child(node)
    while declarator is not None:
        declarator_type = declarator.type

        if declarator_type in _IDENTIFIER_NODE_TYPES:
            return _node_text(declarator).strip()
        if declarator_type in {"destructor_name", "operator_name"}:
            return _node_text(declarator).strip()
        if declarator_type in {"qualified_identifier", "template_function"}:
            name_node = declarator.child_by_field_name("name")
            if name_node is not None:
                return _node_text(name_node).strip()
            return _node_text(declarator).strip()

        if declarator_type not in _DECLARATOR_WRAPPER_NODES:
            name_node = declarator.child_by_field_name("name")
            if name_node is not None:
                return _node_text(name_node).strip()
            return ""

        declarator = _declarator_child(declarator)
    return ""


def _assigned_function_name(node: Any) -> str:
    """Name an anonymous function from the declaration or assignment around it."""
    if node.type not in _ANONYMOUS_FUNCTION_NODE_TYPES:
        return ""
    parent = node.parent
    if parent is None:
        return ""
    field = _ASSIGNED_NAME_PARENTS.get(parent.type)
    if field is None:
        return ""
    target = parent.child_by_field_name(field)
    if target is None:
        return ""
    name = _node_text(target).strip()
    # PHP variable names are spelled with a leading ``$``.
    return name.lstrip("$")


def _node_name(node: Any) -> str:
    if node.type == "function_definition":
        declarator_name = _declarator_name(node)
        if declarator_name:
            return declarator_name
    name_node = node.child_by_field_name("name")
    if name_node is not None:
        return _node_text(name_node).strip()
    assigned_name = _assigned_function_name(node)
    if assigned_name:
        return assigned_name
    if node.type in _NAME_FALLBACK_NODES:
        identifier = _first_identifier(node)
        if identifier is not None:
            return _node_text(identifier).strip()
    return ""


def _parameters_text(node: Any) -> str:
    direct = node.child_by_field_name("parameters")
    if direct is not None:
        return _node_text(direct).strip()

    stack = list(reversed(node.children))
    while stack:
        current = stack.pop()
        parameters = current.child_by_field_name("parameters")
        if parameters is not None:
            return _node_text(parameters).strip()
        if current.type in _PARAMETER_NODE_TYPES:
            return _node_text(current).strip()
        stack.extend(reversed(current.children))

    # Swift stores parameters as direct children without a wrapper node.
    swift_parameters = [
        _node_text(child).strip() for child in node.children if child.type == "parameter"
    ]
    if swift_parameters:
        return "(" + ", ".join(swift_parameters) + ")"
    return ""


def _is_return_node(node: Any) -> bool:
    if node.type in _RETURN_NODE_TYPES:
        return True
    # Swift models ``return`` as a control-transfer statement.
    return (
        node.type == "control_transfer_statement"
        and bool(node.children)
        and node.children[0].type == "return"
    )


def _error_message(node: Any) -> str:
    """Describe a parse error without ever echoing the submitted source.

    The summary is published in a public Skill Card, so it may contain only
    grammar-level facts: the tree-sitter symbol (``node.type``), the line and the
    column. ``node.type`` is a grammar symbol such as ``ERROR`` or ``")"`` and is
    never a substring of the candidate's code.
    """
    line = node.start_point[0] + 1
    column = node.start_point[1] + 1
    if node.is_missing:
        return (
            f"Незакрытая конструкция: ожидается «{node.type}» "
            f"в строке {line}, колонке {column}"
        )
    return f"Синтаксическая ошибка ({node.type}) в строке {line}, колонке {column}"


def _line_count(source: str) -> int:
    return len(source.splitlines()) if source else 0


# =============================================================================
# Public API
# =============================================================================

def _get_profile(language: str) -> LanguageProfile:
    try:
        return SUPPORTED_LANGUAGES[language]
    except (KeyError, TypeError):
        supported = ", ".join(sorted(SUPPORTED_LANGUAGES))
        raise UnsupportedLanguage(
            f"Язык «{language}» не поддерживается. Доступные языки: {supported}."
        ) from None


def analysis_source(code: str, language: str) -> str:
    """Return the source tree-sitter should parse for ``language``.

    PHP snippets without an opening tag are parsed by ``tree-sitter-php`` as
    inline HTML (zero functions, no errors). The tag is therefore prepended for
    analysis only; callers must never mutate the code they store or display.
    """
    if language == "php" and "<?php" not in code.lower():
        return "<?php\n" + code
    return code


def analyze_code(code: str, language: str) -> CodeAnalysis:
    """Parse ``code`` with the grammar for ``language`` without executing it.

    Never raises for syntactically invalid input: the tree-sitter error is
    reported through ``parse_ok``, ``error`` and ``error_line``.  An unknown
    language raises :class:`UnsupportedLanguage` (a ``ValueError``); input that
    is not a string raises :class:`TypeError`.
    """
    if not isinstance(code, str):
        raise TypeError(
            f"Анализируемый код должен быть строкой, получено {type(code).__name__}."
        )
    profile = _get_profile(language)
    source_text = code
    source = source_text.encode("utf-8", errors="replace")

    parser = Parser(Language(profile.parser_factory()))
    tree = parser.parse(source)
    root = tree.root_node

    functions: list[FunctionInfo] = []
    branches: list[BranchInfo] = []
    loops: list[BranchInfo] = []
    returns: list[int] = []
    classes: list[str] = []
    error: str | None = None
    error_line: int | None = None

    stack = [root]
    while stack:
        node = stack.pop()
        node_type = node.type
        line = node.start_point[0] + 1

        if error is None and (node.is_error or node.is_missing):
            error = _error_message(node)
            error_line = line

        if node.is_named and node_type in profile.function_nodes:
            name = _node_name(node)
            if name:
                functions.append(
                    FunctionInfo(
                        name=_truncate(name),
                        params=_truncate(_parameters_text(node)),
                        line=line,
                    )
                )

        if node.is_named and node_type in profile.branch_nodes:
            branches.append(BranchInfo(kind=node_type, line=line))
        if node.is_named and node_type in profile.loop_nodes:
            loops.append(BranchInfo(kind=node_type, line=line))
        if node.is_named and _is_return_node(node):
            returns.append(line)
        if node.is_named and node_type in _CLASS_NODE_TYPES:
            class_name = _node_name(node)
            if class_name:
                classes.append(_truncate(class_name))

        stack.extend(reversed(node.children))

    parse_ok = not root.has_error
    if not parse_ok and error is None:
        error = "Синтаксическая ошибка"
        error_line = 1

    return CodeAnalysis(
        language=language,
        parse_ok=parse_ok,
        error=error,
        error_line=error_line,
        functions=functions,
        branches=branches,
        loops=loops,
        returns=returns,
        classes=classes,
        line_count=_line_count(source_text),
    )


def generate_defense_questions(analysis: CodeAnalysis) -> list[str]:
    """Exactly three deterministic Russian defense questions about ``analysis``."""
    profile = SUPPORTED_LANGUAGES.get(analysis.language)
    label = profile.label if profile is not None else analysis.language
    hint = profile.rubric_hint if profile is not None else "пустые входные данные и неожиданные типы"

    if not analysis.functions:
        return [
            f"Опишите структуру решения на {label}: на какие блоки оно разбито и за что отвечает каждый из них.",
            f"Какие данные и инварианты связывают блоки решения на {label} и что произойдёт при их нарушении?",
            f"Как решение на {label} поведёт себя на границах: {hint}?",
        ]

    function = analysis.functions[0]
    first = (
        f"Объясните назначение функции «{function.name}» (строка {function.line}) "
        "и её вклад в общее решение."
    )

    decisions = analysis.branches + analysis.loops
    decision = min(decisions, key=lambda item: item.line) if decisions else None
    if decision is not None:
        kind_label = _KIND_LABELS.get(decision.kind, decision.kind.replace("_", " "))
        second = (
            f"Объясните, как {kind_label} в строке {decision.line} влияет на ход выполнения "
            "и что произойдёт при противоположном исходе условия."
        )
    else:
        second = (
            f"Опишите, как функция «{function.name}» управляет порядком выполнения "
            "и почему в ней нет дополнительных ветвлений или циклов."
        )

    third = f"Назовите граничный случай для {label}, который может сломать решение: {hint}."
    return [first, second, third]


def language_label(key: str) -> str:
    """Human-readable language name, e.g. ``csharp`` → ``C#``."""
    return _get_profile(key).label
