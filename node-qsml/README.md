node-qsml
=========

Minimal Node bindings for Qualcomm Snapdragon Math Libraries (QSML)

To build this module or install it via npm please make sure that QSML_ROOT points
at the right build of QSML (/include and /lib must be present).

    QSML_ROOT=/opt/Qualcomm/qsml-0.15.0/lp64/x86_64-apple-darwin npm install

All data is expected to be passed as Float32Array. Only a few calls implemented,
the ones which we happen to need.

    sscal(N, ALPHA, X, INCX);

    saxpy(N, ALPHA, X, INCX, Y, INCY);

    sgemm(transpose_a, transpose_b,
          M, N, K,
          ALPHA,
          a, lda,
          b, ldb,
          BETA,
          c, ldc);

    sconv(biased,
          src, srcWidth, srcHeight, srcChannels,
          filters, numFilters, filterX, filterY,
          padLeftRight, padTopBottom, strideX, strideY,
          output, outputWidth, outputHeight);