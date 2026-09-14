package testhi

import "testing"

func TestHi(t *testing.T) {
	if Hi() != "hi" {
		t.Fatal("hi")
	}
}
