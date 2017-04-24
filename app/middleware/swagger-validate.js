'use strict'

const SwaggerParser = require('swagger-parser')
const isEmpty = require('lodash.isempty')
const pathMatching = require('egg-path-matching')

const httpMethods = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch'
]

function stringToPrimative (string) {
  if (typeof string === 'string') {
    // Number
    const numberRe = /^[+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?$/
    if (numberRe.test(string)) {
      return Number(string)
    }

    // Boolean
    if (string === 'true') {
      return true
    }
    if (string === 'false') {
      return false
    }

    // Undefined / Null is ignored due to security reason.
    // Symbol is not necessary.
  }

  return string
}

/**
 * Add more metadata for e throwed by egg-validate
 *
 *  assign meta to every element in e.errors
 */

function enrichValidateError (e, meta) {
  // ensure e is throw by egg-validate
  if (e.code === 'invalid_param') {
    for (const error of e.errors) {
      Object.assign(error, meta)
    }
  }
}

function swaggerPathToExpressPath (path) {
  // /user/{id}/{age} => /user/:id/:age

  return path.replace(/\{/g, ':').replace(/\}/g, '')
}

function matchedPath (path, pathsList) {
  for (const _path of pathsList) {
    const match = pathMatching({ match: _path })

    if (match({ path })) {
      return _path
    }
  }
}

function operationObjectToParameterRules (operationObject) {
  const rules = {
    query: {},
    header: {},
    path: {},
    formData: {},
    body: {}
  }

  const { parameters: parameterObject } = operationObject

  if (!parameterObject) {
    return null
  }

  for (const parameter of parameterObject) {
    const {
      name,
      'in': location
    } = parameter

    if (location === 'body') {
      const { schema } = parameter

      for (const [ name, detail ] of Object.entries(schema.properties)) {
        const rule = {}

        const {
          type,
          required,
          'x-format': xFormat,
          'x-format-options': xFormatOptions
        } = detail

        // requried
        rule.required = required

        // x-format
        rule.type = xFormat || type

        // x-format-options
        Object.assign(rule, xFormatOptions)

        rules[location][name] = rule
      }
    } else {
      const rule = {}
      const {
        type,
        'x-format': xFormat,
        'x-format-options': xFormatOptions
      } = parameter

      // required
      let { required } = parameter
      if (location === 'path') required = true
      rule.required = required

      // x-format
      rule.type = xFormat || type

      // x-format-options
      Object.assign(rule, xFormatOptions)

      rules[location][name] = rule
    }
  }

  return rules
}

function operationObjectToController (operationObject) {
  return operationObject['x-controller']
}

module.exports = (options, app) => {
  const { swaggerFile } = options

  const rulesTable = {}
  const controllersTable = {}
  let pathsList = []

  SwaggerParser.validate(swaggerFile).then(api => {
    const { paths } = api

    // generate rulesTable and pathsList

    for (let [ path, pathItemObject ] of Object.entries(paths)) {
      path = swaggerPathToExpressPath(path)
      pathsList.push(path)

      for (const [ field, object ] of Object.entries(pathItemObject)) {
        if (httpMethods.includes(field)) {
          const httpMethod = field
          const operationObject = object

          if (!rulesTable[path]) {
            rulesTable[path] = {}
          }
          rulesTable[path][httpMethod] = operationObjectToParameterRules(operationObject)

          if (!controllersTable[path]) {
            controllersTable[path] = {}
          }
          controllersTable[path][httpMethod] = operationObjectToController(operationObject)
        }
      }
    }

    // reverse sort pathsList for right order of paths
    pathsList = pathsList.sort().reverse()

    // bind paths to controllers
    for (const [ path, pathObject ] of Object.entries(controllersTable)) {
      for (const [ method, controller ] of Object.entries(pathObject)) {
        if (controller) {
          // bind before start
          app.beforeStart(() => app[method](path, controller))
        }
      }
    }
  })

  return async function middleware (ctx, next) {
    const _path = ctx.request.path.toLowerCase()
    const method = ctx.request.method.toLowerCase()

    const path = matchedPath(_path, pathsList)

    // no rule for path
    if (!path) {
      await next()
      return
    }

    // no rule for method
    if (!rulesTable[path][method]) {
      await next()
      return
    }

    // handle existing rule
    const dataMap = {
      query: ctx.query,
      header: ctx.header,
      path: ctx.params,
      formData: ctx.request.body,
      body: ctx.request.body
    }

    for (const [key, rule] of Object.entries(rulesTable[path][method])) {
      if (!isEmpty(rule)) {
        const data = dataMap[key]

        if (key === 'query') {
          for (const [key, value] of Object.entries(data)) {
            data[key] = stringToPrimative(value)
          }
        }

        try {
          ctx.validate(rule, data)
        } catch (e) {
          enrichValidateError(e, { in: key })
          throw e
        }
      }
    }

    await next()
  }
}
