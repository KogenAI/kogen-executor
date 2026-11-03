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
