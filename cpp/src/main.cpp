#include <emscripten/bind.h>

using namespace emscripten;

extern "C" {
    int add(int a, int b) {
        return a + b;
    }
}

EMSCRIPTEN_BINDINGS(my_module) {
    // Bindings can be added here in the future
    emscripten::function("add", &add);
}
