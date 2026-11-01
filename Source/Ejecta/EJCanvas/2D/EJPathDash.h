// Splits a polyline into dashes for setLineDash(). Header-only C++ so it can
// be tested on any machine (tools/canvas-test). P is any struct with float x, y.

#ifndef EJPathDash_h
#define EJPathDash_h

#include <math.h>
#include <vector>

// More pieces than this and the rest of the path is left out; a dash pattern
// far smaller than the path would otherwise stall the frame
#define EJ_PATH_DASH_MAX_PIECES 20000

// pattern: count lengths, alternating on and off (the caller repeats an odd
// list, as the spec says). offset: how far into the pattern the line starts.
// Each piece that is drawn ("on") is appended to out as its own polyline.
template <typename P>
void EJDashPolyline(const std::vector<P> &points, const float *pattern, int count,
	float offset, std::vector<std::vector<P>> &out
) {
	if( points.size() < 2 ) { return; }
	
	float total = 0;
	for( int i = 0; i < count; i++ ) { total += pattern[i]; }
	if( count < 1 || !(total > 0) || !isfinite(total) ) {
		out.push_back(points);
		return;
	}
	
	// Where in the pattern the line starts
	float phase = isfinite(offset) ? fmodf(offset, total) : 0;
	if( phase < 0 ) { phase += total; }
	int index = 0;
	while( phase >= pattern[index] ) {
		phase -= pattern[index];
		index = (index + 1) % count;
	}
	float remaining = pattern[index] - phase;
	bool on = (index % 2) == 0;
	
	std::vector<P> current;
	if( on ) { current.push_back(points[0]); }
	
	for( size_t i = 0; i + 1 < points.size(); i++ ) {
		const P a = points[i], b = points[i + 1];
		float dx = b.x - a.x, dy = b.y - a.y;
		float length = sqrtf(dx * dx + dy * dy);
		float along = 0;
		
		while( length - along > remaining ) {
			along += remaining;
			P p = a;
			p.x = a.x + dx * along / length;
			p.y = a.y + dy * along / length;
			if( on ) {
				current.push_back(p);
				out.push_back(current);
				current.clear();
				if( out.size() >= EJ_PATH_DASH_MAX_PIECES ) { return; }
			}
			else {
				current.clear();
				current.push_back(p);
			}
			on = !on;
			index = (index + 1) % count;
			remaining = pattern[index];
		}
		remaining -= length - along;
		if( on ) { current.push_back(b); }
	}
	if( on && current.size() >= 2 ) { out.push_back(current); }
}

#endif
