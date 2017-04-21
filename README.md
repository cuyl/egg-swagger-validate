<h1 align="center">egg-swagger-validate</h1>

<p align="center">Validate parameters via swagger for egg.</p>

<p align="center">
<a href="http://standardjs.com/" target="_blank"><img src="https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat" alt="Standard - JavaScript Style Guide"></a>
<a href="http://m31271n.com/" target="_blank"><img src="https://img.shields.io/badge/made%20by-m31271n-brightgreen.svg?style=flat" alt="Made by m31271n"></a>
<img src="https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat" alt="License - MIT">
</p>

## Installation

```sh
npm install -S egg-swagger-validate

# and its dependencies
npm install -S egg-validate
```

## Usage

Import it and its dependencies via `config/plugin.js`:

```js
module.exports = {
  ...

  'validate': {
    enable: true,
    package: 'egg-validate'
  },
  'swagger-validate': {
    enable: true,
    package: 'egg-swagger-validate'
  }

  ...
}
```

Config it via `config/config.<env>.js`:

```
module.exports = {
  ...

  swaggerValidate: {
    swaggerFile: '/absolute/path/to/swagger/file'
  }

  ...
}
```

## Extentions to the Swagger Schema
### Why?
It is NOT one-to-one mapping of Swagger Schema parametrs' type to egg-validate's type. Therefore, I have to find a way to do this.

Swagger specification said:

> Allows extensions to the Swagger Schema. The field name MUST begin with `x-`, for example, `x-internal-id`.

So, I extend it.

### Extensions
Extensions of [Parameter Object](http://swagger.io/specification/#parameterObject):

+ `x-format` corresponding to `type` in [parameter](https://github.com/node-modules/parameter)
+ `x-format-options` corresponding to other fields except `type` in [parameter](https://github.com/node-modules/parameter)

More information of available value of `x-format` and `x-format-options` can be found in [parameter's document](https://github.com/node-modules/parameter).

### Example of extended Swagger Schema

```yaml
paths:
  /mails:
    get:
      summary: get mails
      description: Get Mails
      parameters:
        - name: email
          in: query
          description: email address
          required: true
          type: string
          x-format: email
        - name: quantity
          in: query
          description: quantity of emails
          required: true
          type: number
          x-format: number
          x-format-options:
            max: 20
            min: 1
```
