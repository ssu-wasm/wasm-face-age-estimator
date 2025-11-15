#include <emscripten/bind.h>
#include <string>
#include <vector>
#include <cmath>
#include <random>

using namespace emscripten;

extern "C" {
    int add(int a, int b) {
        return a + b;
    }
    
    int multiply(int a, int b) {
        return a * b;
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
    function("add", &add);
    function("multiply", &multiply);
    function("estimate_age_simple", &estimate_age_simple);
    
    class_<FaceAgeEstimator>("FaceAgeEstimator")
        .constructor<>()
        .function("estimateAge", &FaceAgeEstimator::estimateAge)
        .function("getVersion", &FaceAgeEstimator::getVersion)
        .function("getRandomNumber", &FaceAgeEstimator::getRandomNumber);
}
