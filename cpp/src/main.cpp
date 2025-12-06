#include "sign_recognition.h"
#include <emscripten/bind.h>

// C 스타일 함수들 (기존 코드와의 호환성을 위해)
extern "C" {
    // 간단한 테스트 함수
    const char* test_function() {
        return "Sign Recognition WASM Module v1.0.0";
    }
}

// WASM 바인딩을 위한 래퍼 함수
class SignRecognizerWrapper {
public:
    SignRecognizer recognizer;
    
    SignRecognizerWrapper() {}
    
    bool initialize() {
        return recognizer.initialize();
    }
    
    RecognitionResult recognize(const std::vector<HandLandmark>& landmarks) {
        return recognizer.recognize(landmarks);
    }
    
    std::string recognizeFromPointer(uintptr_t landmarksPtr, int count) {
        float* landmarks = reinterpret_cast<float*>(landmarksPtr);
        return recognizer.recognizeFromPointer(landmarks, count);
    }
    
    void setDetectionThreshold(float threshold) {
        recognizer.setDetectionThreshold(threshold);
    }
    
    void setRecognitionThreshold(float threshold) {
        recognizer.setRecognitionThreshold(threshold);
    }
    
    std::string getVersion() {
        return recognizer.getVersion();
    }
};

// Embind 바인딩
EMSCRIPTEN_BINDINGS(sign_wasm_module) {
    using namespace emscripten;
    
    // C 스타일 함수 바인딩
    function("test_function", &test_function, allow_raw_pointers());
    
    // HandLandmark 구조체 바인딩
    class_<HandLandmark>("HandLandmark")
        .constructor<>()
        .property("x", &HandLandmark::x)
        .property("y", &HandLandmark::y)
        .property("z", &HandLandmark::z);
    
    // RecognitionResult 구조체 바인딩
    class_<RecognitionResult>("RecognitionResult")
        .constructor<>()
        .property("gesture", &RecognitionResult::gesture)
        .property("confidence", &RecognitionResult::confidence)
        .property("id", &RecognitionResult::id);
    
    // SignRecognizer 래퍼 클래스 바인딩
    class_<SignRecognizerWrapper>("SignRecognizer")
        .constructor<>()
        .function("initialize", &SignRecognizerWrapper::initialize)
        .function("recognize", &SignRecognizerWrapper::recognize)
        .function("recognizeFromPointer", &SignRecognizerWrapper::recognizeFromPointer)
        .function("setDetectionThreshold", &SignRecognizerWrapper::setDetectionThreshold)
        .function("setRecognitionThreshold", &SignRecognizerWrapper::setRecognitionThreshold)
        .function("getVersion", &SignRecognizerWrapper::getVersion);
    
    // std::vector<HandLandmark> 바인딩
    register_vector<HandLandmark>("VectorHandLandmark");

    // std::vector<float>를 JS 배열과 호환되게 등록
    register_vector<float>("VectorFloat");

    class_<SignRecognition>("SignRecognition")
        .constructor<>()

        // MLP 함수 바인딩
        .function("setScaler", &SignRecognition::setScaler)
        .function("predictMLP", &SignRecognition::predictMLP)
        ;
}

