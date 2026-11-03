package core

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestDecodeJSONDisplay(t *testing.T) {
	for _, tc := range []struct{ input, want string }{{"1", "1"}, {"1.5", "1.5"}} {
		var value any
		if err := DecodeJSON([]byte(tc.input), &value); err != nil {
			t.Fatal(err)
		}
		if got := Display(value); got != tc.want {
			t.Errorf("Display decoded %s = %q, want %q", tc.input, got, tc.want)
		}
	}
	if got := Display(float64(1)); got != "1.0" {
		t.Errorf("Display float64(1) = %q", got)
	}

	var finding map[string]any
	if err := DecodeJSON([]byte(`{"path":"app.txt","line":1,"message":"looks fine"}`), &finding); err != nil {
		t.Fatal(err)
	}
	got := "note: " + Display(finding["path"]) + ":" + Display(finding["line"]) + ": " + Display(finding["message"])
	if got != "note: app.txt:1: looks fine" {
		t.Errorf("finding = %q", got)
	}
}

func TestDecodeJSONNestedAndComplete(t *testing.T) {
	var value struct {
		Items []any `json:"items"`
	}
	if err := DecodeJSON([]byte("{\"items\":[1,{\"n\":1.5}]} \n\t"), &value); err != nil {
		t.Fatal(err)
	}
	want := []any{json.Number("1"), map[string]any{"n": json.Number("1.5")}}
	if !reflect.DeepEqual(value.Items, want) {
		t.Errorf("items = %#v, want %#v", value.Items, want)
	}
	for _, input := range []string{`1 2`, `1 x`, `{`} {
		var v any
		if err := DecodeJSON([]byte(input), &v); err == nil {
			t.Errorf("DecodeJSON(%q) succeeded", input)
		}
	}
}
