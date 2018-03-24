var knusperli = require('./build/knusperli');

module.exports = function(jpegdata) {
	var buf = knusperli._malloc(jpegdata.length);
	knusperli.HEAPU8.set(jpegdata, buf);
	var width = knusperli._width(buf,jpegdata.length);
	var height = knusperli._height(buf,jpegdata.length);
	var size = width*height*4;
	var rgba = knusperli._malloc(size);
	knusperli._decode(buf,jpegdata.length,rgba);
	var output = new Uint8Array(size);
	output.set(knusperli.HEAPU8.subarray(rgba, rgba + size));
	return {'rgba':output,'width':width,'height':height};
}