// Tests for Source/Ejecta/EJCanvas/2D/EJPathDash.h: just test-canvas
#include "EJPathDash.h"
#include <stdio.h>

struct P { float x, y; };
static int failures = 0;
#define CHECK(cond, ...) do { if( !(cond) ) { failures++; \
	printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while(0)
static bool near(float a, float b) { return fabsf(a - b) < 1e-4f; }

int main() {
	std::vector<P> line = {{0, 0}, {10, 0}};
	std::vector<std::vector<P>> out;
	float pattern[] = {2, 1};
	EJDashPolyline(line, pattern, 2, 0, out);
	CHECK(out.size() == 4, "10 units of 2 on, 1 off: %zu dashes", out.size());
	CHECK(near(out[0][0].x, 0) && near(out[0][1].x, 2) && near(out[1][0].x, 3) && near(out[3][1].x, 10),
		"dash ends: %f %f %f %f", out[0][0].x, out[0][1].x, out[1][0].x, out[3][1].x);
	
	out.clear();
	EJDashPolyline(line, pattern, 2, 2.5f, out);
	CHECK(near(out[0][0].x, .5f) && near(out[0][1].x, 2.5f), "offset starts mid-gap: %f %f", out[0][0].x, out[0][1].x);
	
	out.clear();
	EJDashPolyline(line, pattern, 2, -1, out);
	CHECK(near(out[0][0].x, 1) && near(out[0][1].x, 3), "negative offset moves the pattern on: %f %f", out[0][0].x, out[0][1].x);
	
	// A dash continues around a corner, as one piece with the corner in it
	std::vector<P> corner = {{0, 0}, {1, 0}, {1, 3}};
	float long_[] = {2, 1};
	out.clear();
	EJDashPolyline(corner, long_, 2, 0, out);
	CHECK(out.size() == 2 && out[0].size() == 3 && near(out[0][2].y, 1), "around the corner: %zu %zu", out.size(), out[0].size());
	CHECK(near(out[1][0].y, 2) && near(out[1][1].y, 3), "second dash: %f %f", out[1][0].y, out[1][1].y);
	
	// Zero length dashes are pieces of no length (which draw nothing), and an
	// all-zero pattern draws solid
	float dots[] = {0, 2};
	out.clear();
	EJDashPolyline(line, dots, 2, 0, out);
	bool allEmpty = out.size() == 4;
	for( auto &piece : out ) { allEmpty = allEmpty && near(piece.front().x, piece.back().x); }
	CHECK(allEmpty, "zero length dashes: %zu", out.size());
	float none[] = {0, 0};
	out.clear();
	EJDashPolyline(line, none, 2, 0, out);
	CHECK(out.size() == 1 && out[0].size() == 2, "all-zero pattern is solid");
	
	// A tiny pattern stops at the cap instead of stalling
	std::vector<P> huge = {{0, 0}, {1e6f, 0}};
	float tiny[] = {.01f, .01f};
	out.clear();
	EJDashPolyline(huge, tiny, 2, 0, out);
	CHECK(out.size() == EJ_PATH_DASH_MAX_PIECES, "capped: %zu", out.size());
	
	printf(failures ? "%d FAILED\n" : "all dash tests passed\n", failures);
	return failures != 0;
}
