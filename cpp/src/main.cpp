#include <stdint.h>
#include <emscripten/bind.h>
#include <string>
#include <vector>
#include <cmath>
#include <random>

using namespace emscripten;

extern "C" {
    void process_frame(uint8_t* data, int width, int height) {
        int numPixels = width * height;
        for (int i = 0; i < numPixels; ++i) {
            int idx = i * 4; // RGBA

            // 초록색으로 채우기 (G=255)
            data[idx + 0] = 0;   // R
            data[idx + 1] = 255; // G
            data[idx + 2] = 0;   // B
            data[idx + 3] = 255; // A
        }
    }

    void process_frame_binding(uintptr_t dataPtr, int width, int height) {
        auto* data = reinterpret_cast<uint8_t*>(dataPtr);
        process_frame(data, width, height);
    }

     void applyGrayscale(uintptr_t bufferPtr, int width, int height) {
        uint8_t* data = reinterpret_cast<uint8_t*>(bufferPtr);
        const int length = width * height * 4; // RGBA

        for (int i = 0; i < length; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];

            uint8_t gray = static_cast<uint8_t>((r + g + b) / 3);
            
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        }
    }

    float estimate_age_simple(float face_width, float face_height) {
        // Simple age estimation algorithm based on face proportions
        float ratio = face_height / face_width;
        float base_age = 25.0f;
        
        // Adjust age based on face ratio (this is a simplified example)
        if (ratio > 1.3f) {
            base_age += (ratio - 1.3f) * 20.0f;
        } else if (ratio < 1.1f) {
            base_age -= (1.1f - ratio) * 15.0f;
        }
        
        return std::max(1.0f, std::min(100.0f, base_age));
    }
}

class FaceAgeEstimator {
public:
    FaceAgeEstimator() {
        // Initialize with some default parameters
        std::random_device rd;
        gen.seed(rd());
    }
    
    float estimateAge(float face_width, float face_height, float eye_distance) {
        // More sophisticated age estimation
        float ratio = face_height / face_width;
        float eye_ratio = eye_distance / face_width;
        
        float estimated_age = 30.0f;
        
        // Age estimation based on multiple facial features
        estimated_age += (ratio - 1.2f) * 25.0f;
        estimated_age += (eye_ratio - 0.3f) * 40.0f;
        
        // Add some randomness for demonstration
        std::normal_distribution<float> noise(0.0f, 2.0f);
        estimated_age += noise(gen);
        
        return std::max(1.0f, std::min(100.0f, estimated_age));
    }
    
    std::string getVersion() {
        return "Face Age Estimator v1.0.0";
    }
    
    int getRandomNumber(int min, int max) {
        std::uniform_int_distribution<int> dist(min, max);
        return dist(gen);
    }

private:
    std::mt19937 gen;
};

EMSCRIPTEN_BINDINGS(my_module) {
    function("process_frame", &process_frame_binding);
    function("applyGrayscale", &applyGrayscale);
    function("estimate_age_simple", &estimate_age_simple);
    
    class_<FaceAgeEstimator>("FaceAgeEstimator")
        .constructor<>()
        .function("estimateAge", &FaceAgeEstimator::estimateAge)
        .function("getVersion", &FaceAgeEstimator::getVersion)
        .function("getRandomNumber", &FaceAgeEstimator::getRandomNumber);
}
