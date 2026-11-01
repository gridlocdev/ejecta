// Minimal libc for building the audio mixer as WebAssembly (see build.sh).
// Math comes from JavaScript's Math through imports.
#pragma once
#define M_PI 3.14159265358979323846
#define M_PI_2 1.57079632679489661923
#define INFINITY __builtin_inf()
#define NAN __builtin_nan("")
#define isfinite(x) __builtin_isfinite(x)
#define isnan(x) __builtin_isnan(x)
double sin(double); double cos(double); double pow(double, double); double exp(double);
double log(double); double log10(double); double floor(double); double ceil(double);
double fmod(double, double); double ldexp(double, int); double atan(double); double tan(double);
double sqrt(double); double fabs(double); double fmin(double, double); double fmax(double, double);
float sqrtf(float); float fabsf(float); float fminf(float, float); float fmaxf(float, float);
float sinf(float); float cosf(float); float expf(float); float powf(float, float); float floorf(float);
