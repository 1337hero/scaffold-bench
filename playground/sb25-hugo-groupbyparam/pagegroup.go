// Extracted and trimmed from Hugo's resources/page/pagegroup.go at commit 9c4e14eb.
// Preserves the real GroupByParam body verbatim (including the bug) with local
// stubs for Page/resource helpers so it compiles standalone.
// Original: https://github.com/gohugoio/hugo/blob/master/resources/page/pagegroup.go

package pagegroup

import (
	"errors"
	"reflect"
	"sort"
	"strings"
)

// Page is the minimum interface the fixture needs. Real Hugo's Page has
// ~100 methods; GroupByParam only needs param lookup.
type Page interface {
	Param(key string) any
}

type Pages []Page

type PageGroup struct {
	Key   any
	Pages Pages
}

type PagesGroup []PageGroup

var pagesType = reflect.TypeOf(Pages{})

// GroupByParam groups pages by the value of the named param.
func (p Pages) GroupByParam(key string, order ...string) (PagesGroup, error) {
	if len(p) < 1 {
		return nil, nil
	}

	direction := "asc"
	if len(order) > 0 && (strings.ToLower(order[0]) == "desc" ||
		strings.ToLower(order[0]) == "rev" ||
		strings.ToLower(order[0]) == "reverse") {
		direction = "desc"
	}

	var tmp reflect.Value
	var keyt reflect.Type
	for _, e := range p {
		param := e.Param(key)
		if param != nil {
			if _, ok := param.([]string); !ok {
				keyt = reflect.TypeOf(param)
				tmp = reflect.MakeMap(reflect.MapOf(keyt, pagesType))
				break
			}
		}
	}
	if !tmp.IsValid() {
		return nil, errors.New("there is no such param")
	}

	for _, e := range p {
		param := e.Param(key)
		if param == nil || reflect.TypeOf(param) != keyt {
			continue
		}
		v := reflect.ValueOf(param)
		if !tmp.MapIndex(v).IsValid() {
			tmp.SetMapIndex(v, reflect.MakeSlice(pagesType, 0, 0))
		}
		tmp.SetMapIndex(v, reflect.Append(tmp.MapIndex(v), reflect.ValueOf(e)))
	}

	keys := tmp.MapKeys()
	sortByString(keys, direction)

	var r PagesGroup
	for _, k := range keys {
		r = append(r, PageGroup{
			Key:   k.Interface(),
			Pages: tmp.MapIndex(k).Interface().(Pages),
		})
	}
	return r, nil
}

// sortByString is a trimmed stand-in for Hugo's sortKeys: deterministic
// ordering on string-typed map keys, which is all the fixture needs.
func sortByString(keys []reflect.Value, direction string) {
	sort.Slice(keys, func(i, j int) bool {
		a, b := keys[i].String(), keys[j].String()
		if direction == "desc" {
			return a > b
		}
		return a < b
	})
}
