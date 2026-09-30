/*
 * welcome to stab js
 * https://lung.fyi, 2026
 *
 * licensed under the FULL yes FULL hippocratic license idc
 *   [license text](https://firstdonoharm.dev/version/3/0/full.html)
 *
 */

// whether it's useful or not is subjective, the idea here is to explain everything

/*
 * this bit gets this code to work
 *
 *   const state = reactive({ count: 0 });
 *   effect(() => { span.textContent = state.count; });
 *   state.count++; // span updates by itself!!!
 *
 * this is p straightforward. we can just do this by
 * ~ wrapping an effect in a Proxy
 * ~ when an effect runs, record every property it reads
 * ~ when a prop is written, rerun the effects that read it
 *
 * its all js trivia work
 */

/**
 * null if none is executing rn
 * reads of reactive values check this to know who asked
 *
 * @type {(() => void) | null}
 */
let activeEffect = null;

/**
 * for each reactive object, for each property name, the set of effects that read that property
 *
 * WeakMap keys are objects, and entries vanish when the object is gcd, so this never leaks memory
 *
 * @type {WeakMap<object, Map<string | symbol, Set<() => void>>>}
 */
const subscriptions = new WeakMap();

/**
 * runs func and records every reactive val it reads
 * so func can be rerun when any of them change
 *
 * @param {() => void} func - the work to keep up to date (like update the dom)
 * @returns {void}
 */
function effect(func) {
	const run = () => {
		if (run.disposed) return;
		cleanup(run); // unpilesup last run's subsciptions

		const previous = activeEffect; // remember who was active (effects can nest)
		activeEffect = run;            // "ayyyyy im reading now" (we need this for nesting too)

		try {
			func();
		} finally {
			activeEffect = previous; // func might throw but we still wanna restore
		}
	};

	run.deps = new Set();     // sets of effects that have us
	run.children = new Set(); // effects created while we were runninh
	run.disposed = false;

	if (activeEffect) activeEffect.children.add(run); // whoever's running owns us

	run();
	return () => dispose(run);
}

/**
 * called on every property read
 *
 * if an effect is running, subscribe it to this property
 *
 * @param {object} target - whence we're reading from
 * @param {string | symbol} key - the property name
 * @returns {void}
 */
function track(target, key) {
	if (!activeEffect) return; // read happened outside an effect!!!!

	let byKey = subscriptions.get(target);
	if (!byKey) {
		byKey = new Map();
		subscriptions.set(target, byKey);
	}

	let effects = byKey.get(key);
	if (!effects) {
		effects = new Set(); // we wanna ignore duplicates if the effect reads twice
		byKey.set(key, effects);
	}

	effects.add(activeEffect);
	activeEffect.deps.add(effects); // the reverse link: "i'm in this set"
}

/**
 * call on every property write
 * reruns everything that read thw property
 *
 * @param {object} target - where we're writing to
 * @param {string | symbol} key - the property name
 * @returns {void}
 */
function trigger(target, key) {
	const effects = subscriptions.get(target)?.get(key);
	if (!effects) return;

	// re running an effect resubs it
	//   and mutationg a Set while looping over it can loop 5ever
	[...effects].forEach(run => run());
}

/**
 * wraps an object so that reading a property subscribes the running effect
 *
 * and writing a property re-runs its subscribers
 *
 * @template {object} T
 * @param {T} obj - the plain state object
 * @returns {T} a proxy with the same shape as obj
 */
function reactive(obj) {
	return new Proxy(obj, {
		/**
		 * if the value is itself an object, we just give you a reactive version of it back
		 *
		 * @param {T} target
		 * @param {string | symbol} key
		 * @param {any} receiver - the proxy itself (or an object inheriting from it)
		 */
		get(target, key, receiver) {
			track(target, key);
			const value = Reflect.get(target, key, receiver);

			return value && typeof value === 'object' ? reactive(value) : value;
		},

		/**
		 * @param {T} target
		 * @param {string | symbol} key
		 * @param {any} value
		 * @param {any} receiver
		 * @returns {boolean} whether the write succeeded
		 */
		set(target, key, value, receiver) {
			const ok = Reflect.set(target, key, value, receiver);
			trigger(target, key);
			return ok;
		},
	});
}

/*
 * now we have a `reactive` wrapper!
 *
 *   const state = reactive({ count: 1 });
 *   
 *   effect(() => console.log('count is', state.count)); // logs "count is 1"
 *   state.count = 2;                                    // logs "count is 2"
 *   state.count = 3;                                    // logs "count is 3"
 *
 * this is the part where we make it evaluate expressions
 * we get:
 *   <button on:click="count++">
 *   <span p:text="count">
 *
 * html gives us strings. but if you look at these strings, count it there, but not anywhere in the js!
 * it is instead a state object. we need to treat `count` as `state.count`
 *
 * we'll want to:
 */

// ~ turn the string into a function
// we have this for free already:
//
//   const add = new Function('a', 'b', 'return a + b');
//   add(1, 2); // 3
//

// ~ make bare names resolve to state props
// this is really easy!
// we just have to use the ever-so-hated `with` statement
// if you're familiar with lua, it works just like `setfenv` there

/**
 * eval a js expression string with a state object as its scope
 * , and an extra scope of temporary names that take priority over state
 *
 * @param {string} expression - source text, like `"count + 1"`.
 * @param {object} scope - ur reactive state object
 * @returns {any} the expression's value
 */
function evaluate(expression, scope, locals = {}) {
	return new Function(
		'scope', 'locals',
		`with (scope) { with (locals) { return (${expression}) } }`
	)(scope, locals);
}

/**
 * eval a js statement with a state object as its scope
 * , and an extra scope of temporary names that take priority over state
 *
 * use this for event handlers, where there is no value to return
 *
 * @param {string} statements - source text like `"a = 1; b = 2"`
 * @param {object} scope - ur reactive state object
 * @returns {void}
 */
function execute(statements, scope, locals = {}) {
	new Function(
		'scope', 'locals',
		`with (scope) { with (locals) { ${statements} } }`
	)(scope, locals);
}

/*
 * now we're set and ready to work on the DOM!
 * again, this is what we're targetting:
 *
 *   <div @data="{ count: 0, open: true }">
 *     <button on:click="count++">Add</button>
 *     <span p:textContent="count"></span>
 *     <p @show="open">Hello</p>
 *     <button p:disabled="count >= 3" on:click="open = !open">Toggle</button>
 *   </div>
 *
 */


/** @type {Record<string, 'prop' | 'on' | 'special'>} */
const PREFIXES = {
	'p:': 'prop',      // p:textContent -> set a dom property
	'on:': 'on',       // on:click      -> add an event listener
	'@': 'special',    // @show         -> built-in directives
};

/**
 * splits an attribute name into a directive kind and its argument
 *
 * @param {string} name - an attribute name such as "on:click"
 * @returns {{ kind: 'prop' | 'on' | 'special', arg: string } | null}
 *   `null` if the attribute is not a directive (e.g. `class`, `id`)
 *
 * @example
 * parseAttribute('on:click');  // { kind: 'on', arg: 'click' }
 * parseAttribute('class');     // null
 */
function parseAttribute(name) {
	for (const [prefix, kind] of Object.entries(PREFIXES)) {
		if (name.startsWith(prefix)) {
			return { kind, arg: name.slice(prefix.length) };
		}
	}
	return null;
}
// html attributes are, unfortunately, lowercased when they're parsed.
//
// `<span p:textContent="count">` reaches js as `p:textcontent`
//
// the workaround is writing multiword properties in kebabcase and convert

/** @param {string} text @returns {string} */
function kebabToCamel(text) {
	return text.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

// p:<prop> is an effect
// it runs the expr and assigns the result to the property
//
// because `evaluate` reads thru the reactive property, the effect
// subscribes itself to wtv the expression touches
/**
 * keeps a dom property in sync with an expression
 *
 * @param {HTMLElement} el - the element to update
 * @param {string} prop - the dom property name, already camelCased
 * @param {string} expression - source text, like "count * 2"
 * @param {object} scope - yr reactive state
 * @param {object} locals
 */
function bindProperty(el, prop, expression, scope, locals) {
	effect(() => {
		el[prop] = evaluate(expression, scope, locals);
	});
}

// on:<event> is not an effect, bc it doesn't read state when set up
// it only runs when the event is fired, so its just a listener
/**
 * runs statements whenever a dom event fires on the element
 *
 * @param {HTMLElement} el
 * @param {string} eventName - any dom event: "click", "input", "keydown", etc.
 * @param {string} statements - source text like "count++"
 * @param {object} scope - yr reactive state
 * @param {object} locals - `$event` is added on top
 * @returns {void}
 */
function bindEvent(el, eventName, statements, scope, locals) {
	el.addEventListener(eventName, event => {
		execute(statements, scope, { ...locals, $event: event });
	});
}

// we have an effect that toggles display, and it is `@show`
// setting it to '' kills the override
//
// so the elmnt returns to wtv its stylesheet rly says

/**
 * show or hide an element based on whether the expr is truthy
 *
 * @param {HTMLElement} el
 * @param {string} expression
 * @param {object} scope
 * @param {object} locals
 * @returns {void}
 */
function bindShow(el, expression, scope, locals) {
	effect(() => {
		el.style.display = evaluate(expression, scope, locals) ? '' : 'none';
	});
}

// this is what we're all waiting for
// the big reveal
// get ready
// 3..
// 2...
// 1.......

/**
 * wires up every directive on an element & all of its descendants
 *
 * @param {HTMLElement} el - the element to process
 * @param {object} scope - yr shared reactive state
 * @param {object} [locals] - tmp names from enclosing @for rows
 * @returns {void}
 */
function walk(el, scope, locals = {}) {
	// bindfor walks each row itself so we can let it take over
	if (el.tagName === 'TEMPLATE' && el.hasAttribute('@for')) {
		bindFor(el, el.getAttribute('@for'), scope, locals);
		return;
	}

	// copy the attribute list first
	// its live and we don't want to depend on it staying stable while we do our stuff
	for (const { name, value } of [...el.attributes]) {
		const directive = parseAttribute(name);
		if (!directive) continue; // normal attribute like class="..."

		const { kind, arg } = directive;

		if (kind === 'prop') {
			bindProperty(el, kebabToCamel(arg), value, scope, locals);
		} else if (kind === 'on') {
			bindEvent(el, arg, value, scope, locals);
		} else if (kind === 'special' && arg === 'show') {
			bindShow(el, value, scope, locals);
		} else if (kind === 'special' && arg === 'model') {
			bindModel(el, value, scope, locals);
		}
		// `@data` also goes here and is ignored on purpose
		//   mount() reads it, the walker doesn't havw to
	}

	for (const child of [...el.children]) {
		// a nested @data is its own component
		//
		// it gets mounted separately with its own state
		// so dont wire it up with ours
		if (!child.hasAttribute('@data')) walk(child, scope, locals);
	}
}
/**
 * starts one component;
 *	 evaluates its `@data`,
 *	 makes the result reactive,
 *   walks element tree
 *
 * @param {HTMLElement} root - element with an `@data` attribute
 * @returns {void}
 */
function mount(root) {
	const data = evaluate(root.getAttribute('@data') || '{}', {});
	walk(root, reactive(data));
}

document.querySelectorAll('[\\@data]').forEach(mount);


//
// ok ok this is big
//
// what we just did above gave us a real framework with real reactivity
// we have EVERYTHING we need, basically (sans the `@for`-shaped elemant in the room)
// 
// but its not the best to work with
// . we want some more functionality, some more abstractions
//
// which we'll first do with @model:
//
//   <input p:value="name" on:input="name = $event.target.value">
//
// see this?
// ~ p:value pushes state to dom
// ~ on:input pushes dom to state
//
// it doesn't have to be like this
// . we just want to be able to write this instead
//
//   <input @model="name">
//
// yes, i know, it's magic, but magic often-used enough to be justified
// 

/**
 * two-way binds a form control to a state path
 *
 * checkboxes use `checked` (a boolean) and the `change` event
 * everything else uses `value` (a string) and the `input` event
 *
 * ```html
 * <p>HELL, <span p:text-content="name"></span>!</p>
 * <div class="row">
 * 	<input @model="name" placeholder="Name">
 * 	<button on:click="name = 'Zadupie'">set to Zadupie</button>
 * </div>
 * ```
 *
 * TODO: number inputs to come back as numbers
 * TODO: radio buttons, multiselects
 * TODO: `@model="a + b"` throws, but it also throws in alpine so idk
 *
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el
 * @param {string} path - something assignable, like "name" or "user.name"
 * @param {object} scope
 * @returns {void}
 */
function bindModel(el, path, scope, locals) {
	const isCheckbox = el.type === 'checkbox';
	const prop = isCheckbox ? 'checked' : 'value';
	const eventName = isCheckbox ? 'change' : 'input';

	// state -> dom //
	effect(() => {
		const value = evaluate(path, scope, locals) ?? ''; // avoid "undefined"
		// skip the write if nothing changed
		//
		// assigning to `value` while the user is typing might possibly push the caret to the end of the field
		if (el[prop] !== value) el[prop] = value;
	});

	// dom -> state //
	el.addEventListener(eventName, () => {
		execute(`${path} = $value`, scope, { ...locals, $value: el[prop] });
	});
}

//
// do you feel something still missing in your life?
// trivia: in most slavic languages, the @ symbol is called a "dog"
//         . i have no idea whether it's true, but i'm happy to believe a lie like that
//
// maybe you need one more dog?
//
//   <ul>
//     <template @for="todo in todos">
//       <li p:text-content="todo"></li>
//     </template>
//   </ul>
// 
// awwwwwww
// isn't she cute
//
// Q: what does it do?
// A: per row, it'll copy the template's content, insert the clone
//    , and walk it with locals = { todo: item }
//	  . we only added that capability to `walk` this commit, so check out git blame for this line!
//
// Q: why <template>?
// A: the browser doesn't render a template's contents
//    it just holds them as markup we can copy, usually for webcomponents
//
// Q: when do we redo this?
// A: this is all inside an effect, so reading `todos` subscribes it and this is rebuilt when its changed
//

/**
 * @param {string} spec - "item in list" or "(item, index) in list"
 * @returns {{ itemName: string, indexName: string | undefined, listExpr: string }}
 * @throws {Error} if the text doesnr match either form
 *
 * @example
 * parseFor('todo in todos');
 * // => { itemName: 'todo', indexName: undefined, listExpr: 'todos' }
 * parseFor('(todo, i) in todos');
 * // => { itemName: 'todo', indexName: 'i', listExpr: 'todos' }
 */
function parseFor(spec) {
	const match =
		// i have absolutely no idea whether this is correct or anything my only assurance is regex101
		spec.match(/^\s*\(?\s*(\w+)\s*(?:,\s*(\w+)\s*)?\)?\s+in\s+(.+)$/);

	if (!match) throw new Error(`!!! bad @for value: "${spec}"`);

	const [, itemName, indexName, listExpr] = match;
	return { itemName, indexName, listExpr };
}

/**
 * repeats a <template>'s content once per item in a list
 *
 * every time the list changes, all rows are removed & rebuilt
 *
 * inside each row, we have `itemName` (and maybe `indexName`) available to exprs via `locals`
 *
 * @param {HTMLTemplateElement} template
 * @param {string} spec - attribute val, like `"todo in todos"`.
 * @param {object} scope
 * @param {object} locals
 * @returns {void}
 */
function bindFor(template, spec, scope, locals) {
	const { itemName, indexName, listExpr } = parseFor(spec);

	/** rows currently like in the page, so that we can remove them next time; @type {Element[]} */
	let rows = [];

	effect(() => {
		// toss previous rendering
		rows.forEach(row => row.remove());
		rows = [];

		// reading the list thru proxy subscribes this effect to it:
		// to `todos` itself (replacing the array)
		// , and to its length and items (push, splice, ...)
		const list = evaluate(listExpr, scope, locals);

		list.forEach((item, index) => {
			const row = template.content.firstElementChild.cloneNode(true);

			// put just b4 the <template>, so rows come in the right order
			template.before(row);
			rows.push(row);

			// this rows private names, outer locals are visible too
			const rowLocals = { ...locals, [itemName]: item };
			if (indexName) rowLocals[indexName] = index;

			walk(row, scope, rowLocals);
		});
	});
}

/**
 * unsubscribes an effect from everything, and disposes the effects it created
 *
 * gonna be called b4 every rerun & when the effect is disposed 5ever
 *
 * @param {Function} run
 * @returns {void}
 */
function cleanup(run) {
	run.children.forEach(dispose);
	run.children.clear();

	run.deps.forEach(effects => effects.delete(run));
	run.deps.clear();
}

/**
 * kill 5ever
 *
 * @param {Function} run
 * @returns {void}
 */
function dispose(run) {
	run.disposed = true;
	cleanup(run);
}
