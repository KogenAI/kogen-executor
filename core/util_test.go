package core

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-loop/tools"
)

func TestDisplayFloatInterpolation(t *testing.T) {
	cases := []struct {
		value float64
		want  string
	}{
		{3.0, "3.0"}, {-2.0, "-2.0"}, {100.0, "100.0"},
		{0.5, "0.5"}, {1234567.5, "1234567.5"},
		{123456789.123, "123456789.123"}, {123456789012345.0, "123456789012345.0"},
		{1.0e14, "1.0e14"}, {1.5e15, "1.5e15"}, {1.5e22, "1.5e22"},
		{0.0001, "0.0001"}, {0.00012, "1.2e-4"}, {1.0e-7, "1.0e-7"},
		{1e21, "1.0e21"},
		{9007199254740991.0, "9007199254740991.0"},
		{9007199254740992.0, "9.007199254740992e15"},
		{-9007199254740992.0, "-9.007199254740992e15"},
		{12345678901234568.0, "1.2345678901234568e16"},
		{123456789012345680.0, "1.2345678901234568e17"},
	}
	for _, tc := range cases {
		if got := Display(tc.value); got != tc.want {
			t.Errorf("Display(%v) = %q, want %q", tc.value, got, tc.want)
		}
	}
}

func TestDisplayOtherScalars(t *testing.T) {
	cases := []struct {
		value any
		want  string
	}{
		{json.Number("3"), "3"}, {int(3), "3"}, {int64(-2), "-2"},
		{uint(3), "3"}, {"x", "x"}, {nil, ""}, {true, "true"},
	}
	for _, tc := range cases {
		if got := Display(tc.value); got != tc.want {
			t.Errorf("Display(%v) = %q, want %q", tc.value, got, tc.want)
		}
	}
}

func TestDisplayFindingFloatLine(t *testing.T) {
	var message map[string]any
	if err := json.Unmarshal([]byte(`{"path":"path","line":12.0,"message":"message"}`), &message); err != nil {
		t.Fatal(err)
	}
	got := Display(message["path"]) + ":" + Display(message["line"]) + ": " + Display(message["message"])
	if want := "path:12.0: message"; got != want {
		t.Errorf("finding = %q, want %q", got, want)
	}
}

func TestInspectStringElixirParity(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", `""`},
		{"#{", `"\#{"`},
		{"#", `"#"`},
		{"\"\\", `"\"\\"`},
		{"\n\t\r\x1b\a\b\f\v\x00", `"\n\t\r\e\a\b\f\v\0"`},
		{"\x01\x06\x0e\x1a\x1c\x1f", `"\x01\x06\x0E\x1A\x1C\x1F"`},
		{"\x7f", `"\d"`},
		{"\u0080\u009f", `"\x80\x9F"`},
		{"\u00a0", `"\u00A0"`},
		{"\u00ad\u00a1\u034e", "\"\u00ad\u00a1\u034e\""},
		{"\u034f\u061c", `"\u034F\u061C"`},
		{"\u2000\u200f\u2028\u202e\u205f\u2064\u2066\u2069\ufeff\ufff9\ufffc",
			`"\u2000\u200F\u2028\u202E\u205F\u2064\u2066\u2069\uFEFF\uFFF9\uFFFC"`},
		{"\u2010\u2027\u202f\u205e\u2065\u206a\u3000\ue000\ufffd", "\"\u2010\u2027\u202f\u205e\u2065\u206a\u3000\ue000\ufffd\""},
		{"\U0001F600\U000E0001\U00010000\U0010FFFF", "\"\U0001F600\U000E0001\U00010000\U0010FFFF\""},
		{"\ufffe\uffff", `"\x{FFFE}\x{FFFF}"`},
	}
	for _, tc := range cases {
		if got := InspectString(tc.in); got != tc.want {
			t.Errorf("InspectString(%q) = %s, want %s", tc.in, got, tc.want)
		}
	}
}

func TestDiagnosticText(t *testing.T) {
	text := func(s string) any { return map[string]any{"type": "text", "text": s} }
	msg := func(content any) any { return map[string]any{"content": content} }
	cases := []struct {
		name string
		item any
		want string
	}{
		{"string content is returned unchanged", msg("  a\nb  "), "  a\nb  "},
		{"empty string content", msg(""), ""},
		{"string content is not read as blocks", msg("text"), "text"},
		{"one text block", msg([]any{text("a")}), "a"},
		{"text blocks are joined by one newline", msg([]any{text("a"), text("b"), text("c")}), "a\nb\nc"},
		{"empty list", msg([]any{}), ""},
		{"non-map block contributes no text", msg([]any{"x"}), ""},
		{"non-map blocks between text blocks leave the valid text", msg([]any{text("a"), "x", 3, nil, []any{"y"}, text("b")}), "a\nb"},
		{"map without text contributes no text", msg([]any{map[string]any{"type": "image"}}), ""},
		{"map without text between text blocks leaves the valid text", msg([]any{text("a"), map[string]any{"type": "image"}, text("b")}), "a\nb"},
		{"map with non-string text between text blocks leaves the valid text", msg([]any{text("a"), map[string]any{"text": 5}, map[string]any{"text": nil}, text("b")}), "a\nb"},
		{"number content", msg(3), ""},
		{"map content", msg(map[string]any{"text": "a"}), ""},
		{"list that is not []any", msg([]string{"a", "b"}), ""},
		{"list of maps that is not []any", msg([]map[string]any{{"text": "a"}}), ""},
		{"nil content", msg(nil), ""},
		{"missing content", map[string]any{"text": "a"}, ""},
		{"non-map item", "text", ""},
		{"nil item", nil, ""},
		{"list item", []any{text("a")}, ""},
	}
	for _, tc := range cases {
		if got := DiagnosticText(tc.item); got != tc.want {
			t.Errorf("%s: DiagnosticText(%v) = %q, want %q", tc.name, tc.item, got, tc.want)
		}
	}
}

func TestMaterialText(t *testing.T) {
	cases := []struct {
		name   string
		block  any
		want   string
		wantOK bool
	}{
		{"map with string text", map[string]any{"type": "text", "text": "a"}, "a", true},
		{"map with empty string text", map[string]any{"text": ""}, "", true},
		{"map without text", map[string]any{"type": "image"}, "", false},
		{"map with non-string text", map[string]any{"text": 5}, "", false},
		{"map with nil text", map[string]any{"text": nil}, "", false},
		{"string is not a block", "a", "", false},
		{"nil", nil, "", false},
		{"list", []any{"a"}, "", false},
		{"map of another type", map[string]string{"text": "a"}, "", false},
	}
	for _, tc := range cases {
		got, ok := MaterialText(tc.block)
		if got != tc.want || ok != tc.wantOK {
			t.Errorf("%s: MaterialText(%v) = (%q, %v), want (%q, %v)", tc.name, tc.block, got, ok, tc.want, tc.wantOK)
		}
	}
}

func sharedDefinition(t *testing.T, name string) map[string]any {
	t.Helper()
	def, ok := tools.Definition(name)
	if !ok {
		t.Fatalf("no shared definition for %q", name)
	}
	return def
}

func TestShellDefinitionsUsesSuppliedShell(t *testing.T) {
	supplied := &tools.Tools{}
	names := []string{"read_file", "write_file", "shell", "list_files", "search_text"}
	suppliedShell, ok := supplied.Definition("shell")
	if !ok {
		t.Fatal("the supplied tools have no shell definition")
	}
	var want []any
	for _, name := range names {
		if name == "shell" {
			want = append(want, suppliedShell)
		} else {
			want = append(want, sharedDefinition(t, name))
		}
	}
	got := ShellDefinitions(supplied, names)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ShellDefinitions(%v) = %v, want %v", names, got, want)
	}
}

func TestShellDefinitionsWithoutShellIgnoresSuppliedTools(t *testing.T) {
	names := []string{"read_file", "write_file", "list_files", "search_text"}
	var want []any
	for _, name := range names {
		want = append(want, sharedDefinition(t, name))
	}
	got := ShellDefinitions(nil, names)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ShellDefinitions(nil, %v) = %v, want %v", names, got, want)
	}
}

func TestEncodeJSONKeepsHTMLCharactersAndOmitsFinalNewline(t *testing.T) {
	input := map[string]string{"html": "<b>Tom & Jerry</b>"}
	got, err := EncodeJSON(input)
	if err != nil {
		t.Fatalf("EncodeJSON returned an error: %v", err)
	}
	want := `{"html":"<b>Tom & Jerry</b>"}`
	if string(got) != want {
		t.Fatalf("EncodeJSON = %q, want %q", got, want)
	}
	var decoded map[string]string
	if err := json.Unmarshal(got, &decoded); err != nil {
		t.Fatalf("decoding EncodeJSON output: %v", err)
	}
	if !reflect.DeepEqual(decoded, input) {
		t.Errorf("decoded EncodeJSON output = %v, want %v", decoded, input)
	}
}

func TestEncodeJSONReturnsErrorForUnrepresentableValue(t *testing.T) {
	if got, err := EncodeJSON(make(chan int)); err == nil {
		t.Fatalf("EncodeJSON of a channel returned no error, output %q", got)
	}
}

func TestHashHexKnownVectors(t *testing.T) {
	cases := []struct {
		name  string
		input []byte
		want  string
	}{
		{"non-empty", []byte("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"},
		{"empty", []byte{}, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := HashHex(tc.input); got != tc.want {
				t.Errorf("HashHex(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestNonNilNilSlice(t *testing.T) {
	var input []int
	got := NonNil(input)
	if got == nil {
		t.Error("NonNil(nil) returned a nil slice")
	}
	if len(got) != 0 {
		t.Errorf("NonNil(nil) = %v, want zero length", got)
	}
}

func TestNonNilPopulatedSlice(t *testing.T) {
	input := []int{3, 1, 2}
	want := []int{3, 1, 2}
	if got := NonNil(input); !reflect.DeepEqual(got, want) {
		t.Errorf("NonNil populated slice = %v, want %v", got, want)
	}
}

func TestResumeRefused(t *testing.T) {
	for _, tc := range []struct {
		name   string
		detail string
	}{
		{"supplied", "cannot resume this session"},
		{"empty", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := ResumeRefused(tc.detail)
			if got == nil {
				t.Fatal("ResumeRefused returned nil")
			}
			if got.Class != "candidate" {
				t.Errorf("Class = %q, want candidate", got.Class)
			}
			if got.Reason != "resume_refused" {
				t.Errorf("Reason = %q, want resume_refused", got.Reason)
			}
			if got.Detail != tc.detail {
				t.Errorf("Detail = %q, want %q", got.Detail, tc.detail)
			}
			if got.Exit != 1 {
				t.Errorf("Exit = %d, want 1", got.Exit)
			}
		})
	}
}
