import pytest

from backend.languages import (
    UnsupportedLanguage,
    analyze_code,
    generate_defense_questions,
    language_label,
)

VALID = {
    "python": "def add(a, b):\n    return a + b\n",
    "javascript": "function add(a, b) { return a + b; }\n",
    "typescript": "function add(a: number, b: number): number { return a + b; }\n",
    "java": "class A { int add(int a, int b) { return a + b; } }\n",
    "go": "package main\nfunc add(a int, b int) int { return a + b }\n",
    "csharp": "class A { int Add(int a, int b) { return a + b; } }\n",
    "cpp": "int add(int a, int b) { return a + b; }\n",
    "c": "int add(int a, int b) { return a + b; }\n",
    "rust": "fn add(a: i32, b: i32) -> i32 { a + b }\n",
    "ruby": "def add(a, b)\n  a + b\nend\n",
    "php": "<?php function add($a, $b) { return $a + $b; }\n",
    "kotlin": "fun add(a: Int, b: Int): Int { return a + b }\n",
    "swift": "func add(_ a: Int, _ b: Int) -> Int { return a + b }\n",
}

INVALID = {
    "python": "def add(a, b:\n    return a + b\n",
    "javascript": "function add(a, b) { return a + b;\n",
    "typescript": "function add(a: number, b: number): number { return a + b;\n",
    "java": "class A { int add(int a, int b) { return a + b; }\n",
    "go": "package main\nfunc add(a int, b int) int { return a + b\n",
    "csharp": "class A { int Add(int a, int b) { return a + b; }\n",
    "cpp": "int add(int a, int b) { return a + b;\n",
    "c": "int add(int a, int b) { return a + b;\n",
    "rust": "fn add(a: i32, b: i32) -> i32 { a + b\n",
    "ruby": "def add(a, b)\n  a + b\n",
    "php": "<?php function add($a, $b) { return $a + $b;\n",
    "kotlin": "fun add(a: Int, b: Int): Int { return a + b\n",
    "swift": "func add(_ a: Int, _ b: Int) -> Int { return a + b\n",
}

# One snippet per language that exercises an if, a loop, a class-like
# declaration and an explicit return.
STRUCTURED = {
    "python": """class A:
    def add(self, a, b):
        if a > 0:
            for i in range(b):
                return i
        return a + b""",
    "javascript": """class A {
  add(a, b) {
    if (a > 0) {
      for (let i = 0; i < b; i++) {
        return i;
      }
    }
    return a + b;
  }
}""",
    "typescript": """class A {
  add(a: number, b: number): number {
    if (a > 0) {
      for (let i = 0; i < b; i++) {
        return i;
      }
    }
    return a + b;
  }
}""",
    "java": """class A {
  int add(int a, int b) {
    if (a > 0) { for (int i = 0; i < b; i++) { return i; } }
    return a + b;
  }
}""",
    "go": """package main

type A struct{}

func (a A) add(x int, y int) int {
    if x > 0 {
        for i := 0; i < y; i++ {
            return i
        }
    }
    return x + y
}""",
    "csharp": """class A {
  int Add(int a, int b) {
    if (a > 0) { for (int i = 0; i < b; i++) { return i; } }
    return a + b;
  }
}""",
    "cpp": """struct A { int x; };

int add(int a, int b) {
    if (a > 0) { for (int i = 0; i < b; i++) { return i; } }
    return a + b;
}""",
    "c": """struct A { int x; };

int add(int a, int b) {
    if (a > 0) { for (int i = 0; i < b; i++) { return i; } }
    return a + b;
}""",
    "rust": """struct A { x: i32 }

fn add(a: i32, b: i32) -> i32 {
    if a > 0 {
        for i in 0..b {
            return i;
        }
    }
    a + b
}""",
    "ruby": """class A
  def add(a, b)
    if a > 0
      while b > 0
        return b
      end
    end
    a + b
  end
end""",
    "php": """<?php
class A {
    function add($a, $b) {
        if ($a > 0) {
            for ($i = 0; $i < $b; $i++) {
                return $i;
            }
        }
        return $a + $b;
    }
}""",
    "kotlin": """class A {
    fun add(a: Int, b: Int): Int {
        if (a > 0) {
            for (i in 0 until b) {
                return i
            }
        }
        return a + b
    }
}""",
    "swift": """class A {
    func add(_ a: Int, _ b: Int) -> Int {
        if a > 0 {
            for i in 0..<b {
                return i
            }
        }
        return a + b
    }
}""",
}


@pytest.mark.parametrize("language", sorted(VALID))
def test_valid_snippet_parses_and_finds_function(language):
    result = analyze_code(VALID[language], language)
    assert result.parse_ok is True
    assert result.language == language
    assert result.functions, f"no function found for {language}"


@pytest.mark.parametrize("language", sorted(INVALID))
def test_invalid_snippet_reports_error(language):
    result = analyze_code(INVALID[language], language)
    assert result.parse_ok is False
    assert result.error
    assert result.error_line is not None and result.error_line >= 1


def test_unknown_language_is_rejected():
    with pytest.raises(ValueError):
        analyze_code("x", "cobol")


def test_questions_are_deterministic_and_reference_functions():
    result = analyze_code(VALID["python"], "python")
    first = generate_defense_questions(result)
    second = generate_defense_questions(result)
    assert first == second
    assert len(first) == 3
    assert any("add" in q for q in first)


def test_language_label_is_human_readable():
    assert language_label("csharp") == "C#"
    assert language_label("cpp") == "C++"


@pytest.mark.parametrize(
    ("language", "snippet", "expected"),
    [
        ("c", "struct Node *make(int n) { return 0; }", "make"),
        ("c", "FILE *f(void) { return 0; }", "f"),
        ("cpp", "std::string greet(int n) { return {}; }", "greet"),
        ("cpp", "Foo bar() { return Foo(); }", "bar"),
    ],
)
def test_c_family_function_names_come_from_the_declarator(language, snippet, expected):
    result = analyze_code(snippet, language)
    assert [function.name for function in result.functions] == [expected]


@pytest.mark.parametrize(
    ("snippet", "expected"),
    [
        ("int (*fp(int n))(int) { return 0; }", "fp"),
        ("void (*signal(int sig, void (*func)(int)))(int) { }", "signal"),
        ("struct Node *(*factory(void))(int) { return 0; }", "factory"),
    ],
)
def test_c_functions_returning_function_pointers_are_named(snippet, expected):
    # ``parenthesized_declarator`` holds its inner declarator as an unfielded
    # child, so the name must still be resolved through the wrapper chain.
    result = analyze_code(snippet, "c")
    assert result.parse_ok is True
    assert [function.name for function in result.functions] == [expected]


@pytest.mark.parametrize(
    ("language", "snippet"),
    [
        ("javascript", "const add = (a, b) => a + b;"),
        ("javascript", "let add = function (a, b) { return a + b; };"),
        ("typescript", "const add = (a: number, b: number) => a + b;"),
        ("php", "<?php $add = fn($a, $b) => $a + $b;"),
    ],
)
def test_assigned_anonymous_functions_take_their_declared_name(language, snippet):
    result = analyze_code(snippet, language)
    assert [function.name for function in result.functions] == ["add"]


@pytest.mark.parametrize(
    ("language", "snippet"),
    [
        ("javascript", "(function (a) { return a; })();"),
        ("javascript", "[1].map((value) => value);"),
    ],
)
def test_truly_anonymous_functions_are_skipped(language, snippet):
    result = analyze_code(snippet, language)
    assert result.functions == []


def test_ruby_conditional_expression_is_counted_as_a_branch():
    result = analyze_code("x = 1\nx ? 1 : 2\n", "ruby")
    assert [branch.kind for branch in result.branches] == ["conditional"]


@pytest.mark.parametrize("language", sorted(STRUCTURED))
def test_structured_snippets_find_branches_loops_classes_and_returns(language):
    snippet = STRUCTURED[language]
    result = analyze_code(snippet, language)

    assert result.parse_ok is True, f"{language}: {result.error}"
    assert result.branches, f"{language}: no branches"
    assert result.loops, f"{language}: no loops"
    assert result.classes == ["A"], f"{language}: {result.classes}"
    assert result.returns, f"{language}: no returns"
    assert result.line_count == len(snippet.splitlines())


@pytest.mark.parametrize("value", [b"def add(a, b):\n    return a + b\n", None])
def test_non_string_code_raises_type_error(value):
    with pytest.raises(TypeError):
        analyze_code(value, "python")


def test_unhashable_language_raises_unsupported_language():
    with pytest.raises(UnsupportedLanguage):
        analyze_code("x = 1", ["python"])
    with pytest.raises(UnsupportedLanguage):
        language_label(["python"])


def test_kotlin_same_line_class_body_is_upstream_limitation():
    # Valid Kotlin, but the pinned tree-sitter-kotlin 1.1.0 grammar reports an
    # error (see the module docstring).  This pins current behavior only.
    result = analyze_code("class A { fun f() {} }", "kotlin")
    assert result.parse_ok is False
    assert result.error
