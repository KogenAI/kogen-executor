package contract_test

import (
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

// eq fails the test when got differs from want; item names the contract item and its consumer.
func eq[T comparable](t testing.TB, item string, got, want T) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %#v, want %#v", item, got, want)
	}
}

// deepEq is eq for values that are not comparable.
func deepEq(t testing.TB, item string, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s: got %#v, want %#v", item, got, want)
	}
}

// wantError fails unless err is a *sys.Error of the class and reason; it returns the error.
func wantError(t testing.TB, item string, err error, class, reason string) *sys.Error {
	t.Helper()
	if err == nil {
		t.Errorf("%s: no error, want %s/%s", item, class, reason)
		return nil
	}
	e, ok := sys.AsError(err)
	if !ok {
		t.Errorf("%s: error %v is not a *sys.Error, want %s/%s", item, err, class, reason)
		return nil
	}
	if e.Class != class || e.Reason != reason {
		t.Errorf("%s: error %s/%s (%s), want %s/%s", item, e.Class, e.Reason, e.Detail, class, reason)
	}
	return e
}
