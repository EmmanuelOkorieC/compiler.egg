# Compiler For Egg.js
For this project, I took up the author's challenge to implement a compiler for the programming language, **Egg** built in chapter 12 of the Ebook Eloquent Javascript, Third Edition By Marijn Haverbeke (Note  - I'm open to corrections if any one reads this ;))

Unlike the interpreter that acts directly on our program, This compiler converts it to Javascript code so it can be evaluated more efficiently by doing as much work as possible in advance.

### Slight Differences
Because the interpreter acts on the program, it means things like closures can be called directly which wouldn't be possible in the compiler. Defining a value in the interpreter using the `define` construct means it has to be returned. we do not have to do that for the compiler. 

Unlike the interpreter that handles computation and returns a value directly, The compiler would first convert the program to Javascript syntax then uses the `Function` constructor to run the program.

Because we'll be working with functions, we'll be needing the `return` keyword in quite a few places. There are rules to using the `return` keyword and we must follow this rules when compiling. Our return keyword can not come before an `if` statement, a `while` statement, a `console.log`, a binding declaration (for our compiler we'll be using `var`), a binding re-assignment or another return keyword

### Parser
Our parser for Egg will remain exactly the same except in `parseApply`, I made a little alteration to allow the type "closures" for applications that are themselves applied i.e writing code like this `multiplier(2)(3)`. "closure" expression objects will be similar to the application object as they'd both have an **operators** property and an **args** property. 

The difference will be that for closure objects, it's **operators** property will contain an application object rather than a word object

```javascript
function parseApply(expr, program) {
    if(program[0] != "(") {
        return {expr: expr, rest: program}
    }
    program = skipSpace(program.slice(1))
    if (expr.type == "word") expr = {type:"apply", operator: expr, args: []}
    else expr = {type: "closure", operator: expr, args: []}

    while(program[0] != ")") {
        let arg = parseExpression(program)
        expr.args.push(arg.expr)
        program = skipSpace(arg.rest)
        if(program[0] == ",") {
            program = skipSpace(program.slice(1))
        } else if(program[0] != ")") {
            throw new SyntaxError("Expected ',' or ')'")
        }
    }
    return parseApply(expr, program.slice(1))
}
```
### Evaluate Function
we don't need to return binding values when we evaluate binding names like in the interpreter. Instead we simply return the binding name to whatever special form needs it . (If x is defined as 5 for example, evaluating x anywhere in the code will not return 5 but x instead since javascript will have stored x in memory for us)

we also can't call our functions directly anymore. we instead have to provide a syntax that reflects our function call. To do this I created an object `functionForms` for all function bindings (maybe not the most optimal way to go about this but it worked) and when it is applied, returns a javascript syntax of the function call in the `evluate` function.

```javascript
const specialForms = Object.create(null)
const functionForms = Object.create(null) // first change
function evaluate(expr, scope) {
    if(expr.type == "value") {
        return expr.value
    } else if(expr.type == "word") {
        if(expr.name in scope) {
            if (typeof scope[expr.name] == "function") return scope[expr.name]
            return expr.name //second change. return binding name instead of binding value
        } else if(expr.name in functionForms) {
            return expr.name //third change. function binding is returned when needed
        } else {
            throw new ReferenceError(`Undefined Binding: ${expr.name}`)
        }
    } else if(expr.type == "apply") {
        let {operator, args} = expr
        if (operator.type == "word" && operator.name in specialForms) {
           return specialForms[operator.name](expr.args, scope) 
        } else if (operator.type == "word" && operator.name in functionForms){
          // fourth change. applying a function returns it's syntax
            return `${operator.name}(${args.map(arg => evaluate(arg, scope))})` 
        } else {
            let op = evaluate(operator, scope)
            if(typeof op == "function") {
                return op(...args.map(arg => evaluate(arg, scope)))
            } else {
                throw new TypeError("Applying a non-function")
            }

        }
    } else if (expr.type == "closure") {
        //fifth change. For closures
       return `${evaluate(expr.operator, scope)}(${expr.args.map(arg => evaluate(arg, scope))})`
    } 
}
```
For closure objects, i did something similar except the operator object which represents a function call is also evaluated.

### Special Forms
#### If
what is returned is no longer the value of either evaluating the second or third argument but a javascript syntax representing the whole `if` statement.  

Since the second and third arguments are evaluated in `if`'s block scope, and our program will ideally be wrapped in a function(created by us or using the Fuction constructor), we can use the return statement ( but only if it matches our conditions for using return )
```javascript
specialForms.if = (args, scope) => {
    if(args.length != 3) {
        throw new SyntaxError("Wrong number of args to if")
    } else {

        let evaluate1 = evaluate(args[1], scope)
        let evaluate2 = evaluate(args[2], scope)

        if (!/(^if|^while|^var|^.+\s\=\s|^console\.log|^return)/.test(evaluate1)) {
            evaluate1 = "return" + " " + evaluate1
        }

        if (!/(^if|^while|^var|^.+\s\=\s|^console\.log|^return)/.test(evaluate2)) {
            evaluate2 =  "return" + " " + evaluate2
        }

return `if (${evaluate(args[0], scope)} !== false) {
            ${evaluate1}
            } else {
           ${evaluate2}
        }` 
    }
}
```
#### while
Since while is a loop and we use it for computations, I decided against using the `return` statement (using it will not exactly change anything ) so the while construct simply returns the javascript syntax representing the while statement
```javascript
specialForms.while = (args, scope) => {
    if (args.length != 2) {
        throw new SyntaxError("Wrong number of args to while")
    }

    return `while (${evaluate(args[0], scope)} !== false) {
        ${evaluate(args[1], scope)}
    }`
}
```

#### define
To define a binding, I used the javascript syntax `var` ( personally i felt it aligned more with the way Egg works. For example a variable defined in an if/while block can be accessed outside that block scope). If our identifer binds a normal value, it stores this value in the scope object(*this value will not exactly be used, just the binding name that stores it*) and then returns the javascript syntax representing the whole construct. Else if it is a case of defining a binding that already exists in the scope object(specifically the scope object, not it's prototype or outer scope), A javascript syntax representing a re-assignment without the `var` keyword is returned. Else if the identifier binds a function, it stores the identifier in `functionForms` and returns the corresponding javascript syntax 
```javascript
specialForms.define = (args, scope) => {
    if(args.length != 2 || args[0].type != "word") {
        throw new SyntaxError("Incorrect use of define")
    } else if (args[1].type == "apply" && args[1].operator.name == "fun") {
        functionForms[args[0].name] = args[0].name
        return `var ${args[0].name} = ${evaluate(args[1], scope)}`
    }
    else if(Object.prototype.hasOwnProperty.call(scope, args[0].name)) {
        return `${args[0].name} = ${evaluate(args[1], scope)}`
    } else {
        let eval = evaluate(args[1], scope)
        scope[args[0].name] = eval
        return `var ${args[0].name} = ${eval}`
    }
}
```

#### fun
Instead of returning a function expression like in the interpreter, the `fun` construct returns a javascript syntax representing a function. It's parameters stored in the `params` array is embedded in the string (arrays embedded in strings are automatically converted to strings so say [a, b] is converted to "a, b"). 

```javascript
specialForms.fun = (args, scope) => {
    if(!args.length) {
        throw new SyntaxError("Functions need a body")
    }
    let body = args[args.length - 1]
    let localScope = Object.create(scope)
    localScope.function = "function"
    

    let params = args.slice(0, args.length - 1).map(expr => {
        if(expr.type != "word") {
            throw new SyntaxError("Parameter names must be words")
        }
        localScope[expr.name] = expr.name
        return expr.name
    })
     let evaluate1 = evaluate(body, localScope)
     let test = /(^if|^while|^var|^.+\s\=\s|^console\.log|^return)/.test(evaluate1)

   
        return `function(${params}) {
        if(arguments.length != ${params.length}) {
                throw new TypeError("Wrong number of arguments")
        }
        ${test ? evaluate1 : "return" + " " + evaluate1}
        }`
    
}
```
This returned javascript function syntax when called, checks if the length of the arguments passed in is the same as the length of `params`. If it is not, it throws an error (similar to the interpreter). Since we are defining a function scope, we will need the `return` statement. 

In line with the Egg syntax, our `return` statement can come before the body or after the body of the function. Since the body of the function is in blocks and is mostly handled by the `do` construct, we'll make the `do` construct handle the return statement that comes at the end. To mark function scopes for the `do` construct, a property of name "function" is stored in the local scope (This is needed so that when using `do`, return is only assigned in a function scope)

For the `return` statement at the beginning, we make sure it matches our condition for using return. If it doesn't, the body is added without the return statement

#### do
The `do` construct will be a bit more detailed than it was in the interpreter. For one it doesn't return the final value from our program but instead concatenates all the javascript syntax returned within it (and this concatenated string will be what is returned at the end of the `do` construct)
```javascript
specialForms.do = (args, scope) => {
    let value = ``
    for (let arg of args) {
        if(arg === args[args.length - 1] && arg.type == "word" && Object.hasOwnProperty.call(scope, "function")) {
           return value += "return" + " " + evaluate(arg, scope) + "\n"
        } else if(arg === args[args.length -1] && arg.type == "apply" && (arg.operator.name in functionForms || (typeof topScope[arg.operator.name] == "function" && arg.operator.name !== "print")) && Object.hasOwnProperty.call(scope, "function") ) {
            return value += "return" + " " + evaluate(arg, scope) + "\n"
        } else if (arg === args[args.length - 1] && Object.hasOwnProperty.call(scope, "function") && arg.operator.name == "do" ) {
            return value += evaluate(arg, scope) + "\n" + "return" + " " + "false" + "\n"
        } 
        value += evaluate(arg, scope) + '\n' 
    }
    return value
}
```
For function scopes, the `do` construct behaves differently. The final value is prefixed with a return keyword if it is a binding name or if it is a function call (either one that returns a value like the functions in `topScope` (*excluding* `print`) or a literal function call).

But if the value to be returned is not specified, the last value (most often a `do` construct) will be followed by a "return false" statement. 

So in summary the function will either return a value or false 

#### set
The `set` construct is mainly for re-assignment and the javascript syntax returned will reflect this.
```javascript
 specialForms.set = (args, scope) => {
    if (args.length != 2 && args[0].type != "word") {
        throw new SyntaxError("wrong use of set")
    }
    let name = args[0].name
    let value = evaluate(args[1], scope)
    let outerScope = Object.getPrototypeOf(scope)


    if(Object.prototype.hasOwnProperty.call(scope, name)) {
        scope[name] = value
        return `${name} = ${value}`
    } else if(Object.hasOwnProperty.call(outerScope, name)) {
        outerScope[name] = value
        return `${name} = ${value}`
    } else {
        throw new ReferenceError("Cannot set Property of Undefined Binding")
    }
}
```
### topScope Object
The functions in the `topScope` object will no longer act on the values passed in directly but instead return a javascript syntax representing the whole action

#### print 
The function `print` will no longer call the `console.log` statement directly but instead would return it's syntax
```javascript
topScope.print = value => {
    return `console.log(${value})`
}
```
#### array
Same thing would apply to all array functions in the `topScope` object
```javascript
topScope.array = (...values) => {
    return `[${values}]`
 }
 
 topScope.length = array => {
     return `${array}.length`
 }
 
 topScope.element = (array, n) => {
     return `${array}[${n}]`
 }
```
#### Arithmetic operators
For the arithmetic operators, I decided to modify the code a little bit. If the operator is a "+" or "-" or "*" or "/" then our functions will allow computation with unlimited arguments (unlike in the interpreter where it only uses the first two and ignores the rest of the arguments). So the program `+(1, 2, 3, 4)` will return 10 instead of 3. To do this, I allowed the `Function` constructor convert all arguments passed in to an array using the rest operator then called `join` on this array combining all elements with the operator called. The string returned from this is what `Function` returns.

"<", ">" and "==" will follow the old approach and return a string syntax representing it's computation
```javascript
for (let op of ["+", "-", "*", "/", "==", "<", ">"]) {
    if (op == "+" || op == "-"||op == "*" || op == "/") {
    topScope[op] = Function("...val", `return val.join(" ${op} ")`)
    } else {
    topScope[op] = Function("a, b", `return String(a) + " " + "${op}"+ " " + String(b)`)
    }
}
```

### Compiler Function
The wrapper function `compile` will return a compiled javascript version of our Egg program
```javascript
function compile(program) {
    return evaluate(parse(program), Object.create(topScope))
}
```
Let's look at some code snippets
```javascript
console.log(compile(`
do(define(total, 0),
define(count, 1),
while(<(count, 11),
do(define(total, +(total, count)),
define(count, +(count, 1)))),
print(total))
`));

/* outputs
var total = 0
var count = 1
while (count < 11 !== false) {
        total = total + count
count = count + 1

    }
console.log(total)
*/

console.log(compile(`
do(define(pow, fun(base, exp,
if(==(exp, 0),
1,
*(base, pow(base, -(exp, 1)))))),
print(pow(2, 5)))
`));

/* outputs
var pow = function(base,exp) {
        if(arguments.length != 2) {
                throw new TypeError("Wrong number of arguments")
        }
        if (exp == 0 !== false) {
            return 1
            } else {
           return base * pow(base,exp - 1)
        }
        }
console.log(pow(2,5))
*/

console.log(compile(`do(define(f, fun(a, fun(b, +(a, b)))),print(f(4)(5)))`));

/* outputs
var f = function(a) {
        if(arguments.length != 1) {
                throw new TypeError("Wrong number of arguments")
        }
        return function(b) {
        if(arguments.length != 1) {
                throw new TypeError("Wrong number of arguments")
        }
        return a + b
        }
        }
console.log(f(4)(5))
*/

console.log(compile(`
  do(define(a, 4),
     define(b, fun(val, do(set(a, val), print(a)))),
     b(6),
     print(a))
`))

/* outputs
var a = 4
var b = function(val) {
        if(arguments.length != 1) {
                throw new TypeError("Wrong number of arguments")
        }
        a = val
console.log(a)

        }
b(6)
console.log(a)
*/

console.log(compile(`
do(define(plusOne, fun(a, +(a, 1))),
print(plusOne(10)))
`));

/* outputs
var plusOne = function(a) {
        if(arguments.length != 1) {
                throw new TypeError("Wrong number of arguments")
        }
        return a + 1
        }
console.log(plusOne(10))
*/

console.log(run(`
  do(define(a, 3),
     define(add, fun(arr, +(length(arr), a, 12))),
     print(add(array(1,2,3))))
`))

/* outputs
var a = 3
var add = function(arr) {
        if(arguments.length != 1) {
                throw new TypeError("Wrong number of arguments")
        }
        return arr.length + a + 12
        }
console.log(add([1,2,3]))
*/
```
### Function
The function `run` runs our compiled javascript program by wrapping it in a `Function` constructor and subsequntly calling it. 

This compiled javascript program will be prefixed with a `return` statement in `Function` if it matches our condition for using `return`
```javascript
function run(program) {
    let comp = compile(program)

    if (!/(^if|^while|^var|^.+\s\=\s|^console\.log|^return)/.test(comp)) {
     comp = "return" + " " + comp
    }
    
    return Function(" ", comp)()

}

run(`print(+(1, 2, 3, 4))`)
//outputs 10
```