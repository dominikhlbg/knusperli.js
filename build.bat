cd vendor/knusperli
emcc ../../decode.cc dct_double.cc gamma_correct.cc idct.cc jpeg_data.cc jpeg_data_decoder.cc jpeg_data_reader.cc jpeg_huffman_decode.cc output_image.cc preprocess_downsample.cc quantize.cc -I. -o ../../build/knusperli.js -s EXPORTED_FUNCTIONS="['_width','_height','_decode']" -s EXPORTED_RUNTIME_METHODS="['malloc', 'free']" -std=c++11 -s TOTAL_MEMORY=167772160 -s ALLOW_MEMORY_GROWTH=0 -s INVOKE_RUN=0 --pre-js ../../header.js -O1