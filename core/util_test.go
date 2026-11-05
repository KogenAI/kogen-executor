package core

import (
	"encoding/json"
	"testing"
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
