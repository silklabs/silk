node-nnpack
===========

Node bindings for NNPACK (https://github.com/Maratyszcza/NNPACK).

To build this module or install it via npm please make sure that NNPACK_ROOT points
at the directory NNPACK was built in (/include and /lib must be present).

    NNPACK_ROOT=/home/user/nnpack npm install

All data is expected to be passed as Float32Array.

    convolution(input_channels,
                output_channels,
                input_width,
                input_height,
                padding_top,
                padding_right,
                padding_bottom,
                padding_left,
                kernel_width,
                kernel_height,
                stride_width,
                stride_height,
                input,
                kernel,
                bias, // can be null
                output);

    fullyConnected(input_channels,
                   output_channels,
                   input,
                   kernel,
                   output);

    relu(batch_size,
         channels,
         input,
         output,
         negative_slope);

    maxPooling(batch_size,
               channels,
               input_width,
               input_height,
               padding_top,
               padding_right,
               padding_bottom,
               padding_left,
               kernel_width,
               kernel_height,
               stride_width,
               stride_height,
               input,
               output);
