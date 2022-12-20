//PARSER
// first part
function parseExpression(program) {
    program = skipSpace(program)
    let match, expr
    if(match = /^"([^"]*)"/.exec(program)) {
        expr = {type: 'value', value: match[1]}
    } else if (match = /^\d+\b/.exec(program)) {
        expr = {type: 'value', value: Number(match[0])}
    } else if (match = /^[^\s(),#"]+/.exec(program)) {
        expr = {type: 'word', name: match[0]}
    } else {
        throw new SyntaxError("Unexpected Syntax: " + program)
    }

    return parseApply(expr, program.slice(match[0].length))
}

function skipSpace(string) {
    return string.replace(/(\s|\#\s*.*)/g, "")
}

//second part
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
//third part
function parse(program) {
    let {expr, rest} = parseExpression(program)
    if(skipSpace(rest).length > 0) {
        throw new SyntaxError("Unexpected Text After Program")
    }
    return expr
}

//COMPILER
const specialForms = Object.create(null)
const functionForms = Object.create(null)  // first change
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

specialForms.if = (args, scope) => {
    if(args.length != 3) {
        throw new SyntaxError("Wrong number of args to if")
    } else {

        let evaluate1 = evaluate(args[1], scope)
        let evaluate2 = evaluate(args[2], scope)

        if (!/(^if|^while|^var|^.+\s\=\s|^console\.log)/.test(evaluate1)) {
            evaluate1 = "return" + " " + evaluate1
        }

        if (!/(^if|^while|^var|^.+\s\=\s|^console\.log)/.test(evaluate2)) {
            evaluate2 =  "return" + " " + evaluate2
        }

        return `if (${evaluate(args[0], scope)} !== false) {
            ${evaluate1}
            } else {
           ${evaluate2}
        }` 
    }
}

specialForms.while = (args, scope) => {
    if (args.length != 2) {
        throw new SyntaxError("Wrong number of args to while")
    }

    return `while (${evaluate(args[0], scope)} !== false) {
        ${evaluate(args[1], scope)}
    }`
}

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

const topScope = Object.create(null) 
topScope.true = true
topScope.false = false

let prog = parse(`if(true, false, true)`)
// console.log(evaluate(prog, topScope))

for (let op of ["+", "-", "*", "/", "==", "<", ">"]) {
    if (op == "+" || op == "-"||op == "*" || op == "/") {
    topScope[op] = Function("...val", `return val.join(" ${op} ")`)
    } else {
    topScope[op] = Function("a, b", `return String(a) + " " + "${op}"+ " " + String(b)`)
    }
}

topScope.print = value => {
    return `console.log(${value})`
}

specialForms.fun = (args, scope) => {
    if(!args.length) {
        throw new SyntaxError("Functions need a body")
    }
    let body = args[args.length - 1]
    let localScope = Object.create(scope)
    localScope.function = "first"
    

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

topScope.array = (...values) => {
    return `[${values}]`
 }
 
 topScope.length = array => {
     return `${array}.length`
 }
 
 topScope.element = (array, n) => {
     return `${array}[${n}]`
 }

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

 // Compiler wrapper 
function compile(program) {
    return evaluate(parse(program), Object.create(topScope))
}

// Function wrapper to run program
function run(program) {
    let comp = compile(program)

    if (!/(^if|^while|^var|^.+\s\=\s|^console\.log|^return)/.test(comp)) {
     comp = "return" + " " + comp
    }
    
    return Function(" ", comp)()

}