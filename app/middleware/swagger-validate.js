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

  const rulesTable = {}

  const { paths } = api

  for (const [ path, pathItemObject ] of Object.entries(paths)) {
    for (const [ field, object ] of Object.entries(pathItemObject)) {
      if (httpMethods.includes(field)) {
        const httpMethod = field
        const operationObject = object

        if (!rulesTable[path]) {
          rulesTable[path] = {}
        }
        rulesTable[path][httpMethod] = operationObjectToParameterRules(operationObject)
      }
    }
  }

  return async function middleware (ctx, next) {
    const path = ctx.request.path.toLowerCase()
    const method = ctx.request.method.toLowerCase()

    // no rule for path
    if (!rulesTable[path]) {
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

        ctx.validate(rule, data)
      }
    }

    await next()
  }
}
