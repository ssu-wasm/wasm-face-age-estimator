#include "sign_recognition.h"
#include <emscripten/bind.h>

// C 스타일 함수들 (기존 코드와의 호환성을 위해)
extern "C" {
    // 간단한 테스트 함수
    const char* test_function() {
        return "Sign Recognition WASM Module v1.0.0";
    }
}

// Embind로 C 함수도 바인딩
EMSCRIPTEN_BINDINGS(sign_wasm_module) {
    emscripten::function("test_function", &test_function);
}

