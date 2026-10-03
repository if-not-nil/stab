**`stab.js`**

a tiny reactive framework, with the goals of being:\
~ easy to use\
~ small enough to understand 100% of, and then contribute to/maintain\
~ simple enough to embed\
~ balanced enough to give you the 80%

it's plain html with a script tag; forever zero dependencies

every piece of code is explained in `stab.js`


```html
<script defer src="stab.js"></script>

<div @data="{ count: 0 }">
    <button on:click="count++">add</button>
    <span :text-content="count"></span>
</div>
```

<p align="center">
<a href="#get-started">get started</a> |
<a href="#reference">reference</a> |
<a href="#todo">todo</a>
</p>

### get started

put this on your page
```html
<script defer src="https://cdn.jsdelivr.net/gh/if-not-nil/stab@main/stab.js"></script>
```

**tutorials:**
<details>
<summary>~ todo app:</summary>

five small steps, each one a working page

**state & text**

`@data` makes a component, its value is a js object and that's your state\
everything inside can read and write it

```html
<div @data="{ name: 'world' }">
    <p>hello, <span :text-content="name"></span>!</p>
</div>
```

`:text-content="name"` sets `textContent` to `name` and keeps it up to date\
the part after the colon is a dom property (`kebab-case` becomes `camelCase`)\
  , the value is any js expression

> [!TIP]
> html lowercases attributes, so `:textContent` arrives as `:textcontent`\
> write `kebab-case` instead

**events**

`on:click` runs js when the event fires\
changing state updates the page

```html
<div @data="{ count: 0 }">
    <button on:click="count++">add</button>
    <button on:click="count = 0">reset</button>
    <p :text-content="'clicked ' + count + ' times'"></p>
</div>
```

`on:` values are **statements**, so `a = 1; b = 2` works\
the event is `$event`

> [!NOTE]
> `on:click="() => doThing()"` never runs `doThing`\
> write `on:click="doThing()"`

> [!WARNING]
> directive attributes run as real js\
> never put untrusted text in one, and be careful with `:inner-html`

**inputs & showing stuff**

~ `@model` ties an input to state, both ways\
~ `@show` hides an element when its expression is falsy

```html
<div @data="{ draft: '' }">
    <input @model="draft" placeholder="type something">
    <p @show="draft">you typed: <span :text-content="draft"></span></p>
    <button :disabled="!draft" on:click="draft = ''">clear</button>
</div>
```

`:disabled` is the same `:` binding, on a different property

**lists**

`@for` goes on a `<template>` and repeats it once per item,,,\
the loop variable is just a name inside

```html
<div @data="{ todos: ['buy milk', 'write docs'] }">
  <ul>
    <template @for="(todo, i) in todos">
      <li>
        <span :text-content="(i + 1) + '. ' + todo"></span>
        <button on:click="todos.splice(i, 1)">remove</button>
      </li>
    </template>
  </ul>
</div>
```

`todo in todos` works too, `(todo, i)` adds the index\
the template needs exactly one root element, here `<li>`

**all together**

methods and getters work in `@data`\
, `this` is the state

```html
<style>
  .done { text-decoration: line-through; opacity: .5; }
</style>

<div @data="{
  todos: [],
  draft: '',
  add() {
    if (!this.draft) return;
    this.todos.push({ text: this.draft, done: false });
    this.draft = '';
  },
  get remaining() {
    return this.todos.filter(t => !t.done).length;
  },
}">
  <input @model="draft" placeholder="what needs doing?"
    on:keydown="if ($event.key === 'Enter') add()">
  <button :disabled="!draft" on:click="add()">add</button>

  <ul>
    <template @for="(todo, i) in todos">
      <li>
        <input type="checkbox" @model="todo.done">
        <span :class-name="todo.done ? 'done' : ''" :text-content="todo.text"></span>
        <button on:click="todos.splice(i, 1)">x</button>
      </li>
    </template>
  </ul>

  <p @show="todos.length === 0">nothing to do</p>
  <p @show="todos.length > 0" :text-content="remaining + ' left'"></p>
</div>

<script defer src="stab.js"></script>
```

that's it!

</details>

---

### reference

<details>
<summary>how it works basically</summary>

<br>

~ you change state\
~ whatever read it, gets queued\
~ after your handler, everything updates once\
~ the dom is up to date!!!

because

~ state is a `Proxy`, so reads and writes can be noticed\
~ every `:property`, `@show` etc is an effect, a function that remembers what it read\
~ when something it read changes, it runs again

</details>

**components**

~ `@data="{ a: 1 }"` starts a component with this state\
~ `@data` alone has no state (handy for reading `$store`)\
~ `@data="counter(5)"` uses a factory from `Stab.data`\
~ `@data="counter"` same, with no arguments

a nested `@data` is its own component,,, it can't see its parent's state

components added later (`innerHTML`, htmx, yr scripts) start by themselves, and removed ones get cleaned up by themselves

new html inside a component gets its directives bound too,,,\
  , using that component's state and any enclosing loop variables

---

**directives**

| attribute | what it does |
|---|---|
| `:<property>="expr"` | sets a dom property, kept up to date |
| `on:<event>="statements"` | runs statements on the event |
| `@show="expr"` | `display: none` when falsy |
| `@model="path"` | two-way binds an input to a path like `user.name` |
| `@for="item in list"` | repeats a `<template>` per item, or `(item, index) in list` |
| `@ref="name"` | the element becomes `$refs.name` |
| `@init="statements"` | runs once on setup |
| `@get="/url"`, `@post="/url"`, etc | requests html from a server |
| `@target="#selector"` | where the response goes, or `this` |

**`:<property>`**

any dom property works: `:text-content`, `:value`, `:disabled`, `:hidden`, `:title`, `:class-name`, `:inner-html`

properties, not attributes\
::: `:class-name` replaces all classes, there's no `:class`

> [!WARNING]
> a typo like `:textcontnet` sets a useless property without any error. sorry

**`on:<event>`**

add modifiers with dots: `on:click.prevent.stop`

<details>
<summary>all the modifiers</summary>

<br>

| modifier | what it does |
|---|---|
| `.prevent` | `event.preventDefault()` |
| `.stop` | `event.stopPropagation()` |
| `.self` | only if the event started on this element, not a child |
| `.once` | runs once |
| `.capture` | capture phase instead of bubbling |
| `.passive` | promises not to call `preventDefault` |
| `.window` | listens on `window` |
| `.document` | listens on `document` |

</details>

an unknown modifier is logged and the listener isn't added\
; event names are lowercase

`.window` and `.document` listeners are cleaned up with the element

**`@model`**

~ text inputs, textareas and selects use `value` and `input`\
~ checkboxes use `checked` and `change`\
~ values are always strings, even for `type="number"`\
~ no radio buttons or multi-selects yet

**`@for`**

~ goes on a `<template>` with exactly one root element\
~ arrays only\
~ loop variables work in every directive inside the row

> [!NOTE]
> the whole list is rebuilt when the array changes\
> focus and half-typed text inside a row are killed mercilessly

**`@init`**

runs before the elements after it are set up\
so their `$refs` aren't there yet, use `$nextTick`

---

**HTTP requests**

html can come from a server too

```html
<div @data>
  <button @get="/messages" @target="#messages">load messages</button>
  <main id="messages"></main>
</div>
```

~ `@get`, `@post`, `@put`, `@patch`, `@delete` pick the HTTP method\
~ `@target` is a css selector, or `this` for the element itself\
~ the response replaces the target's contents

same `stab.js`, same script tag, nothing else to load

URLs and targets are plain strings, not expressions\
, use exactly one request directive and a target, inside `@data`

returned directives use the target's state, including `@for` variables\
a returned `@data` makes its own component as usual

**forms**

put the request on a form and it submits instead of clicking

```html
<div @data>
  <form @post="/messages" @target="#messages">
    <input name="message" required>
    <button name="action" value="send">send</button>
  </form>
  <main id="messages"></main>
</div>
```

~ named, enabled fields go with it, including the submit button\
~ GET adds query parameters, keeping any already in the URL\
~ the other methods send URL-encoded fields\
~ `enctype="multipart/form-data"` sends files too

native form validation still works\
request buttons outside a form send no fields

<details>
<summary>loading, errors & the fiddly bits</summary>

<br>

```html
<div @data="{ loading: false, error: '' }"
  on:stab:before-request="loading = true; error = ''"
  on:stab:error="error = $event.detail.error.message"
  on:stab:complete="loading = false">
  <button @get="/messages" @target="#messages" :disabled="loading">load</button>
  <p @show="loading">loading...</p>
  <p @show="error" :text-content="error"></p>
  <main id="messages"></main>
</div>
```

| event | when |
|---|---|
| `stab:before-request` | before sending, cancel with `$event.preventDefault()` |
| `stab:success` | after the response's directives are bound |
| `stab:error` | a network, HTTP or configuration error |
| `stab:complete` | finished, including cancellation or abort |

they bubble, and `$event.detail` has `url`, `options`, `target`, `response`,
`error`, `aborted` and `canceled`\
anything not available yet is `null`

before-request can change `detail.url` or mutate Fetch options, like
`detail.options.headers['X-CSRF-Token'] = token`\
stab owns the cancellation signal; everything else keeps the browser's defaults

~ the requester gets `aria-busy="true"`, then its old value back\
~ clicking it again while busy is ignored\
~ another requester for the same target wins, the older request gets aborted\
~ removing or unmounting the requester aborts it too\
~ disconnected targets never get late responses

an HTTP error leaves the old html alone\
so does a 204 response; an empty 200 empties the target

events come from the requester\
if the response removed it, success & complete come from the target instead

> [!NOTE]
> aborting a request can't undo anything the server already did

> [!WARNING]
> serve trusted html, just like with `:inner-html`\
> returned directives run as js; returned script tags don't run

no history, retries, caching or automatic JSON handling yet\
there are working examples in [demo.html](demo.html#http-get)

</details>

---

**magic names**

available in any expression or statements

| name | what it is |
|---|---|
| `$event` | the event, in `on:` handlers |
| `$el` | the element the directive is on |
| `$refs` | elements named with `@ref` |
| `$dispatch(name, detail)` | fires an event from `$el` that bubbles up, listen with `on:name` on a parent, read `$event.detail` |
| `$watch(source, callback)` | calls `callback(new, old)` when a value changes, not for the first value |
| `$nextTick(callback)` | runs after the page has updated, also returns a promise |
| `$store` | state shared by every component |

`source` is a string like `'query'` or a function like `() => todo.done`\
it's shallow, `user.name = 'x'` won't fire a watcher on `user`

`$refs` in `@for` rows share a name, you get the last row

> [!WARNING]
> `$` names shadow state with the same name\
> don't start your own state with `$` please its stupid

```html
<!-- focus an input right after it appears -->
<div @data="{ editing: false }">
  <button on:click="editing = true; $nextTick(() => $refs.box.focus())">edit</button>
  <input @ref="box" @show="editing">
</div>

<!-- close a menu when you click anywhere else -->
<div @data="{ open: false }" on:click.window="if (!$el.contains($event.target)) open = false">
  <button on:click="open = !open">menu</button>
  <ul @show="open"><li>one</li><li>two</li></ul>
</div>
```

> [!TIP]
> the page updates after your handler, not during it\
> to read it right after a change, wait with `$nextTick`

---

**from javascript**

everything is on one global, `Stab`

| function | what it does |
|---|---|
| `Stab.data(name, factory)` | registers a reusable `@data` |
| `Stab.store(name, object)` | registers shared state as `$store.name`, returns the reactive object |
| `Stab.directive(name, setup)` | registers a custom `@name` |
| `Stab.reactive(obj)` | tracks reads and writes on an object |
| `Stab.effect(fn)` | runs `fn` now and whenever what it read changes, returns a function that stops it |
| `Stab.watch(getter, callback)` | js version of `$watch` |
| `Stab.nextTick(callback)` | waits for the page to update |
| `Stab.untracked(fn)` | runs `fn` without tracking what it reads |
| `Stab.mount(el)`, `Stab.unmount(el)` | start or stop one component |
| `Stab.start()` | mounts everything, !!!it runs by itself on page load |

**registering things before components start**

components mount when the page is ready\
register `Stab.data` and `Stab.store` in `stab:init`, it fires just before mounting

```html
<script>
  document.addEventListener('stab:init', () => {
    Stab.data('counter', (start = 0) => ({
      count: start,
      inc() { this.count++ },
    }));

    const cookies = Stab.store('cookies', { clicks: 0 });

    // script tag code can react to the same state
    Stab.effect(() => { document.title = `${cookies.clicks} clicks`; });
  });
</script>
<script defer src="stab.js"></script>

<div @data="counter(5)">
  <button on:click="inc()">+</button>
  <span :text-content="count"></span>
</div>

<button @data on:click="$store.cookies.clicks++">cookie</button>
```

> [!IMPORTANT]
> put the listener script before `stab.js`\
> a store must be an object or array, there has to be something to track

<details>
<summary>custom directives</summary>

<br>

register in `stab:init`, or later; existing elements get bound too

```js
Stab.directive('focus-on-click', ({ el, cleanup }) => {
  const handler = () => el.focus();
  el.addEventListener('click', handler);
  cleanup(() => el.removeEventListener('click', handler));
});
```

setup gets `el`, `value`, `evaluate(expression)`, `execute(statements)`,
`effect(fn)` and `cleanup(fn)`\
evaluate uses the element's state & magic names\
setup is untracked; use an effect for reactive reads

cleanup runs when the element or component is disposed\
duplicate names and built-in names throw

</details>

<details>
<summary>running the demo</summary>

```sh
python3 server.py
```

open [localhost:8765/demo.html](http://localhost:8765/demo.html)\
no install needed, just python's standard library

the `/demo/` routes are examples, bring yr own backend\
a different port can be passed, like `python3 server.py 8000`

</details>

### todo

- [ ] `@if` (add and remove elements, instead of hiding them)
- [ ] binding html attributes, like `data-*` or `aria-*`
- [ ] key modifiers like `on:keydown.enter` (maybe dont, check `$event.key`)
- [ ] radio buttons and multi-selects in `@model`
- [ ] looping over objects (maybe dont)
- [ ] reusing rows in `@for`
- [x] fetching html, with `@get`, `@post` etc
