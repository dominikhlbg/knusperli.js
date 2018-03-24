// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#include <cassert>
#include <fstream>
#include <sstream>

#include "jpeg_data.h"
#include "jpeg_data_decoder.h"
#include "jpeg_data_reader.h"

using knusperli::DecodeJpegToRGB;
using knusperli::JPEGData;
using knusperli::JPEG_READ_ALL;
using knusperli::ReadJpeg;
using knusperli::JPEG_READ_HEADER;

int main(int argc, char** argv) {
}

extern "C" {
int width(uint8_t* input, int size) {
	JPEGData jpg;
	bool read_ok = ReadJpeg(input, size, JPEG_READ_HEADER, &jpg);
	if (!read_ok) {
		printf("Error reading jpeg data from input file.\n");
		return 1;
	}
	return jpg.width;
}
int height(uint8_t* input, int size) {
	JPEGData jpg;
	bool read_ok = ReadJpeg(input, size, JPEG_READ_HEADER, &jpg);
	if (!read_ok) {
		printf("Error reading jpeg data from input file.\n");
		return 1;
	}
	return jpg.height;
}
int decode(uint8_t* input, int size, char* rgba, char* output) {
	JPEGData jpg;
	std::vector<uint8_t> rgb;

	bool read_ok = ReadJpeg(input, size, JPEG_READ_ALL, &jpg);
	if (!read_ok) {
		printf("Error reading jpeg data from input file.\n");
		return 1;
	}
	rgb = DecodeJpegToRGB(jpg);
	if (rgb.empty()) {
		printf("Failed to decode.\n");
		return 1;
	}

	for(int i=0;i<jpg.width;i++)
		for (int j = 0; j < jpg.height; j++) {
			int rgbaoffset = j*jpg.width * 4 + i*4;
			int rgboffset = j*jpg.width * 3 + i*3;
			rgba[rgbaoffset + 0] = rgb[rgboffset + 0];
			rgba[rgbaoffset+ 1] = rgb[rgboffset + 1];
			rgba[rgbaoffset + 2] = rgb[rgboffset + 2];
			rgba[rgbaoffset + 3] = 255;
		}
	return 0;
}
}