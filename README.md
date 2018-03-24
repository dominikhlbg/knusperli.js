# Knusperli.js

Knusperli.js is port of the [Knusperli](https://github.com/google/knusperli) JPEG deblocking decoder.

The goal of Knusperli is to reduce blocking artifacts in decoded JPEG images, by interpreting quantized DCT coefficients in the image data as an interval, rather than a fixed value, and choosing the value from that interval that minimizes discontinuities at block boundaries.

## Installation and usage

Install using npm.

    npm install knusperli

```javascript
var knusperli = require('knusperli');
```

## API

### knusperli.decode(buffer):{rgba:Uint8Array, width:Number, height:Number}

You can decode every jpeg images and get as return a json object with all rgba values as Uint8Array and width and height

```javascript
// decode jpegData (array)
knusperli.decode(jpegData);
```

## License

Apache-2.0
