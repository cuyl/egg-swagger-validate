'use strict'

const fs = require('fs')
const yaml = require('js-yaml')
const isEmpty = require('lodash.isempty')

const httpMethods = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch'
]

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
    const rule = {}

    const { name,
            in: location,
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

  return rules
}

module.exports = (options, app) => {
  const swaggerContent = fs.readFileSync(options.swaggerFile, 'utf8')
  const api = yaml.safeLoad(swaggerContent)

  const rules = {}

  const { paths } = api

  for (const [ path, pathItemObject ] of Object.entries(paths)) {
    for (const [ field, object ] of Object.entries(pathItemObject)) {
      if (httpMethods.includes(field)) {
        const httpMethod = field
        const operationObject = object

        if (!rules[path]) {
          rules[path] = {}
        }
        rules[path][httpMethod] = operationObjectToParameterRules(operationObject)
      }
    }
  }

  return async function middleware (ctx, next) {
    const path = ctx.request.path.toLowerCase()
    const method = ctx.request.method.toLowerCase()

    // no rule for path
    if (!rules[path]) {
      await next()
      return
    }

    // no rule for method
    if (!rules[path][method]) {
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

    for (const [key, rule] of Object.entries(rules[path][method])) {
      if (!isEmpty(rule)) {
        const data = dataMap[key]
        ctx.validate(rule, data)
      }
    }

    await next()
  }
}
