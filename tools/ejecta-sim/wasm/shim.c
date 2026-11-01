// The few libc functions the mixer and stb_vorbis need, for WebAssembly.
#include <stddef.h>
#include <stdint.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

// From JavaScript (see sim.mjs)
#define IMPORT(name) __attribute__((import_module("env"), import_name(name)))
IMPORT("sin") double js_sin(double);
IMPORT("cos") double js_cos(double);
IMPORT("pow") double js_pow(double, double);
IMPORT("exp") double js_exp(double);
IMPORT("log") double js_log(double);
IMPORT("atan") double js_atan(double);
IMPORT("tan") double js_tan(double);

double sin(double x) { return js_sin(x); }
double cos(double x) { return js_cos(x); }
double pow(double x, double y) { return js_pow(x, y); }
double exp(double x) { return js_exp(x); }
double log(double x) { return js_log(x); }
double log10(double x) { return js_log(x) / 2.302585092994046; }
double atan(double x) { return js_atan(x); }
double tan(double x) { return js_tan(x); }
double sqrt(double x) { return __builtin_sqrt(x); }
double fabs(double x) { return __builtin_fabs(x); }
double floor(double x) { return __builtin_floor(x); }
double ceil(double x) { return __builtin_ceil(x); }
double fmin(double a, double b) { return a < b ? a : (b == b ? b : a); }
double fmax(double a, double b) { return a > b ? a : (b == b ? b : a); }
double fmod(double x, double y) { return x - __builtin_trunc(x / y) * y; }
double ldexp(double x, int e) { return x * js_pow(2, e); }
float sqrtf(float x) { return __builtin_sqrtf(x); }
float fabsf(float x) { return __builtin_fabsf(x); }
float fminf(float a, float b) { return a < b ? a : (b == b ? b : a); }
float fmaxf(float a, float b) { return a > b ? a : (b == b ? b : a); }
float sinf(float x) { return (float)js_sin(x); }
float cosf(float x) { return (float)js_cos(x); }
float expf(float x) { return (float)js_exp(x); }
float powf(float x, float y) { return (float)js_pow(x, y); }
float floorf(float x) { return __builtin_floorf(x); }
int abs(int x) { return x < 0 ? -x : x; }

void *memcpy(void *d, const void *s, size_t n) { return __builtin_memcpy(d, s, n); }
void *memmove(void *d, const void *s, size_t n) { return __builtin_memmove(d, s, n); }
void *memset(void *d, int c, size_t n) { return __builtin_memset(d, c, n); }
int memcmp(const void *a, const void *b, size_t n) {
	const unsigned char *x = a, *y = b;
	for( size_t i = 0; i < n; i++ ) { if( x[i] != y[i] ) { return x[i] - y[i]; } }
	return 0;
}

// Size-class allocator: blocks of 2^k bytes, an 8-byte header holds k.
// Freed blocks go on their class's list and are reused.
extern unsigned char __heap_base;
static uintptr_t heapTop = 0;
static void *freeLists[48];

static void *grow(size_t bytes) {
	if( !heapTop ) { heapTop = ((uintptr_t)&__heap_base + 15) & ~(uintptr_t)15; }
	uintptr_t start = heapTop, end = start + bytes;
	size_t have = __builtin_wasm_memory_size(0) * 65536;
	if( end > have ) {
		size_t pages = (end - have + 65535) / 65536;
		if( __builtin_wasm_memory_grow(0, pages) == (size_t)-1 ) { return NULL; }
	}
	heapTop = end;
	return (void *)start;
}

void *malloc(size_t size) {
	int k = 4;
	while( ((size_t)1 << k) < size + 8 ) { k++; }
	unsigned char *block;
	if( freeLists[k] ) {
		block = freeLists[k];
		freeLists[k] = *(void **)(block + 8);
	}
	else {
		block = grow((size_t)1 << k);
		if( !block ) { return NULL; }
	}
	*(uint32_t *)block = (uint32_t)k;
	return block + 8;
}

void free(void *p) {
	if( !p ) { return; }
	unsigned char *block = (unsigned char *)p - 8;
	int k = (int)*(uint32_t *)block;
	*(void **)(block + 8) = freeLists[k];
	freeLists[k] = block;
}

void *calloc(size_t n, size_t size) {
	void *p = malloc(n * size);
	if( p ) { memset(p, 0, n * size); }
	return p;
}

void *realloc(void *p, size_t size) {
	if( !p ) { return malloc(size); }
	int k = (int)*(uint32_t *)((unsigned char *)p - 8);
	size_t capacity = ((size_t)1 << k) - 8;
	if( size <= capacity ) { return p; }
	void *q = malloc(size);
	if( q ) { memcpy(q, p, capacity); free(p); }
	return q;
}

// Insertion sort is plenty for stb_vorbis's small codebook tables
void qsort(void *base, size_t n, size_t size, int (*compare)(const void *, const void *)) {
	unsigned char *a = base, tmp[64];
	for( size_t i = 1; i < n; i++ ) {
		for( size_t j = i; j > 0 && compare(a + (j - 1) * size, a + j * size) > 0; j-- ) {
			unsigned char *x = a + (j - 1) * size, *y = a + j * size;
			for( size_t done = 0; done < size; done += sizeof(tmp) ) {
				size_t c = size - done < sizeof(tmp) ? size - done : sizeof(tmp);
				memcpy(tmp, x + done, c); memcpy(x + done, y + done, c); memcpy(y + done, tmp, c);
			}
		}
	}
}
